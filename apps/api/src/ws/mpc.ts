// Transport adapter for the /mpc socket.io namespace. The protocol itself lives
// in the transport-agnostic Ceremony orchestrator (services/mpc/ceremony.ts);
// this just auths, rate-limits, validates, and routes messages to the ceremony
// the socket owns. A socket can only touch ceremonies it created. Disconnect
// aborts everything in-flight (no resume). Payloads/shares are never logged.

import type { Server, Socket } from "socket.io"
import {
  mpcAbortMessage,
  mpcCeremonyStart,
  parseMpcRoundMessage,
  type MpcCeremonyStart,
  type MpcCeremonyType,
} from "@walty/shared/mpc/messages"
import { rateLimitByUser, RateLimitError } from "@walty/shared/rate-limit"
import { logger } from "../config/logger.js"
import { Ceremony, CeremonyError } from "../services/mpc/ceremony.js"
import { markSessionTrusted } from "../services/deviceSessions.js"
import { isSocketSessionLive } from "./io.js"

// Rate-limit ceremony starts per user. Each start counts once; per-round
// messages are bounded by the protocol round count, not rate-limited.
const MPC_START_LIMIT = 10
const MPC_START_WINDOW_MS = 60_000

// Caps on live ceremonies so a client can't pin unbounded memory + WASM parties
// by opening many sockets or stalling ceremonies under the rate limit. Per-user
// cap spans all the user's sockets and is the real backstop.
const MAX_CEREMONIES_PER_SOCKET = 3
const MAX_CEREMONIES_PER_USER = 5

// Live ceremony count per user across all their sockets. Decremented exactly
// once on teardown (complete/abort/reap/disconnect); entries removed at zero.
const liveCeremoniesByUser = new Map<number, number>()

function userLiveCount(userId: number): number {
  return liveCeremoniesByUser.get(userId) ?? 0
}

function incUserLive(userId: number): void {
  liveCeremoniesByUser.set(userId, userLiveCount(userId) + 1)
}

function decUserLive(userId: number): void {
  const next = userLiveCount(userId) - 1
  if (next <= 0) liveCeremoniesByUser.delete(userId)
  else liveCeremoniesByUser.set(userId, next)
}

interface SocketCeremonyState {
  /** ceremonyId → Ceremony, owned by this socket. */
  ceremonies: Map<string, Ceremony>
}

function stateFor(socket: Socket): SocketCeremonyState {
  let state = socket.data.mpc as SocketCeremonyState | undefined
  if (!state) {
    state = { ceremonies: new Map() }
    socket.data.mpc = state
  }
  return state
}

function emitError(
  socket: Socket,
  ceremonyId: string | undefined,
  reason: string,
  message: string,
): void {
  socket.emit("ceremony:error", { ceremonyId, reason, message })
}

// Abort every in-flight ceremony on this socket (teardown frees WASM + per-user
// slots), tell the client, drop the socket. Used when the session goes invalid
// mid-connection.
function killSocket(
  socket: Socket,
  state: SocketCeremonyState,
  reason: string,
): void {
  emitError(socket, undefined, reason, "session no longer valid")
  for (const ceremony of [...state.ceremonies.values()]) {
    try {
      ceremony.abort(reason)
    } catch {
      /* best effort */
    }
  }
  state.ceremonies.clear()
  socket.disconnect(true)
}

export function registerMpcNamespace(
  io: Server,
  authMiddleware: (socket: Socket, next: (err?: Error) => void) => void,
): void {
  const ns = io.of("/mpc")
  ns.use(authMiddleware)

  ns.on("connection", (socket) => {
    const userId = socket.data.userId as number | undefined
    if (typeof userId !== "number") {
      socket.disconnect(true)
      return
    }
    const state = stateFor(socket)

    socket.on("ceremony:start", async (raw: unknown) => {
      let input: MpcCeremonyStart
      try {
        input = mpcCeremonyStart.parse(raw)
      } catch {
        emitError(socket, undefined, "invalid_payload", "invalid ceremony:start")
        return
      }

      // Re-check session liveness: the JWT may have expired or the device
      // session been revoked since the handshake on this long-lived socket.
      if (!(await isSocketSessionLive(socket))) {
        killSocket(socket, state, "session_invalid")
        return
      }

      // Reject over-cap before doing any DKG/keyshare work.
      if (state.ceremonies.size >= MAX_CEREMONIES_PER_SOCKET) {
        emitError(
          socket,
          undefined,
          "too_many_ceremonies",
          "too many concurrent ceremonies on this connection",
        )
        return
      }
      if (userLiveCount(userId) >= MAX_CEREMONIES_PER_USER) {
        emitError(
          socket,
          undefined,
          "too_many_ceremonies",
          "too many concurrent ceremonies for this user",
        )
        return
      }

      try {
        await rateLimitByUser(
          userId,
          "mpc-ceremony",
          MPC_START_LIMIT,
          MPC_START_WINDOW_MS,
        )
      } catch (err) {
        if (err instanceof RateLimitError) {
          emitError(socket, undefined, "rate_limited", "too many ceremonies")
          return
        }
        emitError(socket, undefined, "internal", "rate limit check failed")
        return
      }

      try {
        const { ceremony, firstOutbound, expiresAt } = await Ceremony.create({
          userId,
          ceremonyType: input.ceremonyType as MpcCeremonyType,
          keyId: input.keyId,
          signHash: input.signHash as `0x${string}` | undefined,
          derivationIndex: input.derivationIndex,
          derive: input.derive,
        })
        state.ceremonies.set(ceremony.ceremonyId, ceremony)
        // Reserve the per-user slot; the one-shot teardown hook releases it +
        // the map entry on any terminal path (complete/abort/reap/disconnect).
        incUserLive(userId)
        ceremony.onTeardownOnce(() => {
          state.ceremonies.delete(ceremony.ceremonyId)
          decUserLive(userId)
        })
        socket.emit("ceremony:started", {
          ceremonyId: ceremony.ceremonyId,
          keyId: ceremony.keyId,
          outbound: firstOutbound,
          expiresAt,
        })
      } catch (err) {
        const reason = err instanceof CeremonyError ? err.reason : "internal"
        logger.warn({ userId, reason }, "mpc ceremony start failed")
        emitError(socket, undefined, reason, "ceremony start failed")
      }
    })

    socket.on("ceremony:round", async (raw: unknown) => {
      let msg
      try {
        msg = parseMpcRoundMessage(raw)
      } catch {
        emitError(socket, undefined, "invalid_payload", "invalid round message")
        return
      }

      // Re-check liveness every round: a multi-round ceremony must stop if the
      // session is revoked/expires mid-flight.
      if (!(await isSocketSessionLive(socket))) {
        killSocket(socket, state, "session_invalid")
        return
      }

      const ceremony = state.ceremonies.get(msg.ceremonyId)
      if (!ceremony) {
        emitError(socket, msg.ceremonyId, "not_found", "unknown ceremony")
        return
      }

      try {
        const result = await ceremony.submitRound({
          ceremonyType: msg.ceremonyType,
          keyId: msg.keyId,
          partyId: msg.partyId,
          round: msg.round,
          sequence: msg.sequence,
          expiresAt: msg.expiresAt,
          payload: msg.payload,
        })
        socket.emit("ceremony:message", {
          ceremonyId: ceremony.ceremonyId,
          outbound: result.outbound,
          done: result.done,
          keyId: result.keyId,
          signature: result.signature,
          expiresAt: result.expiresAt,
        })
        if (result.done) {
          state.ceremonies.delete(ceremony.ceremonyId)
          // DKG/refresh completion proves the device holds the keyshare — trust the session.
          if (ceremony.ceremonyType === "dkg" || ceremony.ceremonyType === "refresh") {
            const sid = socket.data.sid as string | undefined
            if (sid) {
              void markSessionTrusted(sid).catch((err) =>
                logger.error({ err, sid, ceremonyType: ceremony.ceremonyType }, "markSessionTrusted failed after ceremony"),
              )
            } else {
              logger.error({ userId, ceremonyType: ceremony.ceremonyType }, "markSessionTrusted skipped: sid missing from socket")
            }
          }
        }
      } catch (err) {
        const reason = err instanceof CeremonyError ? err.reason : "internal"
        // Orchestrator tears itself down on error; drop our reference.
        state.ceremonies.delete(ceremony.ceremonyId)
        logger.warn({ userId, reason }, "mpc ceremony round rejected")
        emitError(socket, ceremony.ceremonyId, reason, "round rejected")
      }
    })

    socket.on("ceremony:abort", (raw: unknown) => {
      let msg
      try {
        msg = mpcAbortMessage.parse(raw)
      } catch {
        emitError(socket, undefined, "invalid_payload", "invalid abort message")
        return
      }
      const ceremony = state.ceremonies.get(msg.ceremonyId)
      if (!ceremony) return
      // abort() fires the teardown hook (removes map entry, frees per-user slot).
      ceremony.abort("client_abort")
      socket.emit("ceremony:aborted", { ceremonyId: msg.ceremonyId })
    })

    // disconnect: abort everything in-flight (no resume).
    socket.on("disconnect", () => {
      // Snapshot first: abort()'s teardown hook mutates this map.
      for (const ceremony of [...state.ceremonies.values()]) {
        try {
          ceremony.abort("disconnect")
        } catch {
          /* best effort */
        }
      }
      state.ceremonies.clear()
    })
  })
}
