// apps/api/src/ws/mpc.ts
//
// The /mpc socket.io namespace: the thin transport adapter in front of the
// transport-agnostic Ceremony orchestrator (services/mpc/ceremony.ts).
//
// Responsibilities (and ONLY these — the protocol lives in Ceremony):
//   - Reuse the same JWT auth middleware as the other authed namespaces.
//   - Rate-limit ceremony starts per user (rateLimitByUser).
//   - Validate every inbound round message with parseMpcRoundMessage.
//   - Route each message to the Ceremony instance it belongs to, scoped to
//     this socket / user (a socket can only touch ceremonies it created).
//   - Emit the server's outbound bundle back to the client.
//   - Handle an explicit `abort` event.
//   - On socket disconnect, ABORT every in-flight ceremony (no resume).
//
// Wire events:
//   client → server  "ceremony:start"  { ceremonyType, keyId?, signHash? }
//   server → client  "ceremony:started" { ceremonyId, keyId, outbound, expiresAt }
//   client → server  "ceremony:round"  MpcRoundMessage
//   server → client  "ceremony:message" { ceremonyId, outbound, done, keyId?, signature?, expiresAt }
//   client → server  "ceremony:abort"  MpcAbortMessage
//   server → client  "ceremony:error"  { ceremonyId?, reason, message }
//
// Nothing sensitive (payloads / shares) is ever logged.

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
import { isSocketSessionLive } from "./io.js"

// Ceremony-start rate limit: a generous handful of new ceremonies per minute.
// A ceremony is a multi-round flow, so each *start* counts once; the per-round
// messages are bounded by the protocol round count, not rate-limited.
const MPC_START_LIMIT = 10
const MPC_START_WINDOW_MS = 60_000

// Concurrency bounds on LIVE (in-flight) ceremonies. The rate limit caps the
// *rate* of starts; these cap how many can be alive at once, so a client can't
// pin unbounded server memory + WASM parties by opening many sockets or
// stalling many ceremonies just under the rate limit.
//
// A normal client runs exactly one ceremony at a time per socket; 3 gives slack
// for retries/overlap. The per-user cap spans that user's sockets (a user may
// legitimately have a couple of devices) and is the real backstop.
const MAX_CEREMONIES_PER_SOCKET = 3
const MAX_CEREMONIES_PER_USER = 5

// Per-userId count of live ceremonies across all of that user's /mpc sockets.
// Incremented when a ceremony is created, decremented exactly once on its
// teardown (complete / abort / reap / disconnect). Entries are removed at zero.
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

/**
 * Abort every in-flight ceremony on this socket (freeing WASM + per-user slots
 * via each ceremony's teardown hook), tell the client why, and drop the socket.
 * Used when the session is found to be no longer live mid-connection.
 */
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

    // --- ceremony:start ---------------------------------------------------
    socket.on("ceremony:start", async (raw: unknown) => {
      let input: MpcCeremonyStart
      try {
        input = mpcCeremonyStart.parse(raw)
      } catch {
        emitError(socket, undefined, "invalid_payload", "invalid ceremony:start")
        return
      }

      // Re-check the session is still live on this long-lived socket: a JWT may
      // have expired, or the device session may have been revoked, since the
      // handshake. If so, abort everything + disconnect.
      if (!(await isSocketSessionLive(socket))) {
        killSocket(socket, state, "session_invalid")
        return
      }

      // Concurrency caps — reject cleanly BEFORE doing any DKG/keyshare work.
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
        })
        state.ceremonies.set(ceremony.ceremonyId, ceremony)
        // Reserve the per-user slot and register a one-shot teardown hook so the
        // slot + map entry are released on ANY terminal path (complete / abort /
        // reaper-on-deadline / disconnect). The hook runs at most once.
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

    // --- ceremony:round ---------------------------------------------------
    socket.on("ceremony:round", async (raw: unknown) => {
      let msg
      try {
        msg = parseMpcRoundMessage(raw)
      } catch {
        emitError(socket, undefined, "invalid_payload", "invalid round message")
        return
      }

      // Re-verify the session liveness on every round too (the ceremony can run
      // for several rounds; a revoke/expiry mid-flight must stop it).
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
        }
      } catch (err) {
        const reason = err instanceof CeremonyError ? err.reason : "internal"
        // The orchestrator tears itself down on error; drop our reference.
        state.ceremonies.delete(ceremony.ceremonyId)
        logger.warn({ userId, reason }, "mpc ceremony round rejected")
        emitError(socket, ceremony.ceremonyId, reason, "round rejected")
      }
    })

    // --- ceremony:abort ---------------------------------------------------
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
      // abort() fires the teardown hook, which removes the map entry and frees
      // the per-user slot. (delete here would be redundant.)
      ceremony.abort("client_abort")
      socket.emit("ceremony:aborted", { ceremonyId: msg.ceremonyId })
    })

    // --- disconnect: abort everything in-flight (no resume) ---------------
    socket.on("disconnect", () => {
      // Snapshot first: abort() fires the teardown hook, which mutates this map
      // (and decrements the per-user counter exactly once per ceremony).
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
