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

// Ceremony-start rate limit: a generous handful of new ceremonies per minute.
// A ceremony is a multi-round flow, so each *start* counts once; the per-round
// messages are bounded by the protocol round count, not rate-limited.
const MPC_START_LIMIT = 10
const MPC_START_WINDOW_MS = 60_000

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

      const ceremony = state.ceremonies.get(msg.ceremonyId)
      if (!ceremony) {
        emitError(socket, msg.ceremonyId, "not_found", "unknown ceremony")
        return
      }

      try {
        const result = await ceremony.submitRound({
          ceremonyType: msg.ceremonyType,
          keyId: msg.keyId,
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
      ceremony.abort("client_abort")
      state.ceremonies.delete(msg.ceremonyId)
      socket.emit("ceremony:aborted", { ceremonyId: msg.ceremonyId })
    })

    // --- disconnect: abort everything in-flight (no resume) ---------------
    socket.on("disconnect", () => {
      for (const ceremony of state.ceremonies.values()) {
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
