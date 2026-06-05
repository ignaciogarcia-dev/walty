import type { Server as HttpServer } from "node:http"
import { and, eq } from "drizzle-orm"
import { Server } from "socket.io"
import { db, txIntents } from "@walty/db"
import { verifySessionToken } from "@walty/shared/auth/session-token"
import { getBusinessContext } from "@walty/shared/business/getBusinessContext"
import { MPC_PAYLOAD_MAX_BYTES } from "@walty/shared/mpc/messages"
import {
  DEVICE_EVENTS,
  DEVICES_NAMESPACE,
  type DevicePairingRequestedEvent,
  type DevicePairingResolvedEvent,
} from "@walty/shared/devices/events"
import { env } from "../config/env.js"
import { logger } from "../config/logger.js"
import { findSession } from "../services/deviceSessions.js"
import { registerMpcNamespace } from "./mpc.js"

/** Extract the session token from a socket handshake (cookie / bearer / auth). */
function tokenFromHandshake(socket: import("socket.io").Socket): string | null {
  const cookieHeader = socket.handshake.headers.cookie ?? ""
  const cookieToken = /(?:^|;\s*)token=([^;]+)/.exec(cookieHeader)?.[1]
  const bearer = /^Bearer\s+(.+)$/i.exec(
    socket.handshake.headers.authorization ?? "",
  )?.[1]
  // Browsers can't set headers on the WS upgrade, so `auth.token` is the
  // cross-origin path. Still fully verified by callers (JWT + live session).
  const authObj = socket.handshake.auth as { token?: unknown } | undefined
  const authToken = typeof authObj?.token === "string" ? authObj.token : null
  const token = cookieToken
    ? decodeURIComponent(cookieToken)
    : (bearer ?? authToken)
  return token ?? null
}

/**
 * Re-verify mid-connection that the session is still live: JWT verifies, sid/
 * userId match the socket, and the device_session row exists and isn't revoked.
 * Long-lived namespaces (/mpc) call this before privileged actions so a revoked
 * or expired session can't keep driving an already-open socket. Cheap: one
 * indexed lookup + a stateless verify.
 */
export async function isSocketSessionLive(
  socket: import("socket.io").Socket,
): Promise<boolean> {
  const token = tokenFromHandshake(socket)
  if (!token) return false
  try {
    const auth = verifySessionToken(token) // throws on expiry/tamper
    if (!auth.sid) return false
    if (auth.userId !== socket.data.userId || auth.sid !== socket.data.sid) {
      return false
    }
    const session = await findSession(auth.sid)
    if (!session || session.userId !== auth.userId || session.revokedAt) {
      return false
    }
    return true
  } catch {
    return false
  }
}

async function authMiddleware(
  socket: import("socket.io").Socket,
  next: (err?: Error) => void,
) {
  const token = tokenFromHandshake(socket)
  if (!token) {
    next(new Error("unauthorized"))
    return
  }
  try {
    const auth = verifySessionToken(token)
    if (!auth.sid) {
      next(new Error("unauthorized"))
      return
    }
    const session = await findSession(auth.sid)
    if (!session || session.userId !== auth.userId || session.revokedAt) {
      next(new Error("unauthorized"))
      return
    }
    socket.data.userId = auth.userId
    socket.data.sid = auth.sid
    next()
  } catch {
    next(new Error("unauthorized"))
  }
}

const INTENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

let ioInstance: Server | null = null

export function initWebSocket(httpServer: HttpServer): Server {
  if (ioInstance) return ioInstance

  const io = new Server(httpServer, {
    cors: { origin: env.webOrigin, credentials: true },
    serveClient: false,
    // Hard cap on one inbound packet. /mpc round payloads are the only large
    // frames; their schema cap is MPC_PAYLOAD_MAX_BYTES (1 MB). socket.io
    // measures the whole packet (envelope + event name + base64 payload), so add
    // headroom for the envelope while still dropping anything materially larger.
    maxHttpBufferSize: MPC_PAYLOAD_MAX_BYTES + 200_000,
  })

  // /tx-intents namespace — authenticated, room per intent id, scoped to owning user.
  // The eventual sign-server protocol (server → client `intent:sign-request`,
  // client → server `intent:sign-response`) lives here too. For now we only
  // ship status updates emitted from the REST routes.
  const txIntentsNs = io.of("/tx-intents")
  txIntentsNs.use(authMiddleware)
  txIntentsNs.on("connection", (socket) => {
    socket.on("subscribe", async (intentId: unknown) => {
      if (typeof intentId !== "string" || !INTENT_ID_RE.test(intentId)) return
      const userId = socket.data.userId as number | undefined
      if (typeof userId !== "number") return
      try {
        const [owned] = await db
          .select({ id: txIntents.id })
          .from(txIntents)
          .where(and(eq(txIntents.id, intentId), eq(txIntents.userId, userId)))
          .limit(1)
        if (!owned) return
        socket.join(`intent:${intentId}`)
      } catch (err) {
        logger.warn({ err, intentId }, "tx-intents subscribe lookup failed")
      }
    })
    socket.on("unsubscribe", (intentId: unknown) => {
      if (typeof intentId !== "string" || !INTENT_ID_RE.test(intentId)) return
      socket.leave(`intent:${intentId}`)
    })
  })

  // /business namespace — authenticated, one room per business. Used to
  // notify the dashboard that the active payment request changed so the
  // home page can refetch without polling. Server resolves the room from
  // the session and ignores any client-supplied businessId.
  const businessNs = io.of("/business")
  businessNs.use(authMiddleware)
  businessNs.on("connection", async (socket) => {
    const userId = socket.data.userId as number | undefined
    if (typeof userId !== "number") {
      socket.disconnect(true)
      return
    }
    try {
      const ctx = await getBusinessContext(userId)
      if (!ctx) return
      socket.data.businessId = ctx.businessId
      socket.join(`business:${ctx.businessId}`)
    } catch (err) {
      logger.warn({ err, userId }, "business namespace join failed")
    }
  })

  // /devices namespace — authenticated, one room per user. Carries pairing
  // and revocation events so every open device of an account reacts live.
  // The room is resolved from the session; clients supply nothing.
  const devicesNs = io.of(DEVICES_NAMESPACE)
  devicesNs.use(authMiddleware)
  devicesNs.on("connection", (socket) => {
    const userId = socket.data.userId as number | undefined
    if (typeof userId !== "number") {
      socket.disconnect(true)
      return
    }
    socket.join(`user:${userId}`)
  })

  // /payment-requests namespace — public, room per request id.
  // Anyone with the requestId (which lives in the QR) can subscribe.
  const paymentNs = io.of("/payment-requests")
  paymentNs.on("connection", (socket) => {
    socket.on("subscribe", (requestId: unknown) => {
      if (typeof requestId !== "string" || !INTENT_ID_RE.test(requestId)) return
      socket.join(`request:${requestId}`)
    })
    socket.on("unsubscribe", (requestId: unknown) => {
      if (typeof requestId !== "string" || !INTENT_ID_RE.test(requestId)) return
      socket.leave(`request:${requestId}`)
    })
  })

  // /mpc namespace — authenticated MPC ceremony orchestration (DKG / sign /
  // refresh). The protocol + guards live in services/mpc/ceremony.ts; this
  // namespace is a thin transport adapter. Disconnect aborts in-flight work.
  registerMpcNamespace(io, authMiddleware)

  ioInstance = io
  logger.info("websocket initialized")
  return io
}

export function getIo(): Server | null {
  return ioInstance
}

const AUTHED_NAMESPACES = ["/tx-intents", "/business", "/devices", "/mpc"] as const

/** Drops any open authed sockets for a revoked session id (best-effort). */
export async function disconnectSession(sid: string): Promise<void> {
  const io = ioInstance
  if (!io) return
  for (const ns of AUTHED_NAMESPACES) {
    const sockets = await io.of(ns).fetchSockets()
    for (const s of sockets) {
      if (s.data.sid === sid) s.disconnect(true)
    }
  }
}

export function closeWebSocket(): Promise<void> {
  const io = ioInstance
  if (!io) return Promise.resolve()
  ioInstance = null
  return new Promise((resolve) => {
    io.close(() => resolve())
  })
}

export { type PaymentRequestEvent } from "@walty/shared/payments/events"
import type { PaymentRequestEvent } from "@walty/shared/payments/events"

export function emitPaymentRequestEvent(event: PaymentRequestEvent): void {
  const io = ioInstance
  if (!io) return
  io.of("/payment-requests")
    .to(`request:${event.requestId}`)
    .emit(`request:${event.type}`, event)
}

export type TxIntentStatus =
  | "pending"
  | "signed"
  | "broadcasting"
  | "broadcasted"
  | "confirmed"
  | "failed"
  | "expired"

/**
 * "Active payment request changed for this business". No payload — the
 * client refetches /payment-requests once. Covers create/cancel/paid/
 * expired transitions so the home page can drop its 30s poll.
 */
export function emitBusinessActiveChanged(businessId: number): void {
  const io = ioInstance
  if (!io) return
  io.of("/business")
    .to(`business:${businessId}`)
    .emit("business:active-changed", {})
}

export function emitTxIntentStatus(intent: {
  id: string
  status: TxIntentStatus
  txHash?: string | null
}): void {
  const io = ioInstance
  if (!io) return
  io.of("/tx-intents")
    .to(`intent:${intent.id}`)
    .emit("intent:status", {
      intentId: intent.id,
      status: intent.status,
      txHash: intent.txHash ?? null,
    })
}

function emitToUser(userId: number, event: string, payload: unknown): void {
  const io = ioInstance
  if (!io) return
  io.of(DEVICES_NAMESPACE).to(`user:${userId}`).emit(event, payload)
}

export function emitDevicePairingRequested(
  userId: number,
  payload: DevicePairingRequestedEvent,
): void {
  emitToUser(userId, DEVICE_EVENTS.pairingRequested, payload)
  emitToUser(userId, DEVICE_EVENTS.listChanged, {})
}

export function emitDevicePairingApproved(
  userId: number,
  payload: DevicePairingResolvedEvent,
): void {
  emitToUser(userId, DEVICE_EVENTS.pairingApproved, payload)
  emitToUser(userId, DEVICE_EVENTS.listChanged, {})
}

export function emitDevicePairingRejected(
  userId: number,
  payload: DevicePairingResolvedEvent,
): void {
  emitToUser(userId, DEVICE_EVENTS.pairingRejected, payload)
  emitToUser(userId, DEVICE_EVENTS.listChanged, {})
}

export function emitDeviceRevoked(userId: number, sid: string): void {
  emitToUser(userId, DEVICE_EVENTS.revoked, { sid })
  emitToUser(userId, DEVICE_EVENTS.listChanged, {})
}

export function emitDeviceListChanged(userId: number): void {
  emitToUser(userId, DEVICE_EVENTS.listChanged, {})
}
