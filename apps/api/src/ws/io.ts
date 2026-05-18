import type { Server as HttpServer } from "node:http"
import { and, eq } from "drizzle-orm"
import { Server } from "socket.io"
import { db, txIntents } from "@walty/db"
import { verifySessionToken } from "@walty/shared/auth/session-token"
import { env } from "../config/env.js"
import { logger } from "../config/logger.js"

const INTENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

let ioInstance: Server | null = null

export function initWebSocket(httpServer: HttpServer): Server {
  if (ioInstance) return ioInstance

  const io = new Server(httpServer, {
    cors: { origin: env.webOrigin, credentials: true },
    serveClient: false,
  })

  // /tx-intents namespace — authenticated, room per intent id, scoped to owning user.
  // The eventual sign-server protocol (server → client `intent:sign-request`,
  // client → server `intent:sign-response`) lives here too. For now we only
  // ship status updates emitted from the REST routes.
  const txIntentsNs = io.of("/tx-intents")
  txIntentsNs.use((socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie ?? ""
    const cookieToken = /(?:^|;\s*)token=([^;]+)/.exec(cookieHeader)?.[1]
    const bearer = /^Bearer\s+(.+)$/i.exec(
      socket.handshake.headers.authorization ?? "",
    )?.[1]
    const token = cookieToken
      ? decodeURIComponent(cookieToken)
      : (bearer ?? null)
    if (!token) {
      next(new Error("unauthorized"))
      return
    }
    try {
      const auth = verifySessionToken(token)
      socket.data.userId = auth.userId
      next()
    } catch {
      next(new Error("unauthorized"))
    }
  })
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

  ioInstance = io
  logger.info("websocket initialized")
  return io
}

export function getIo(): Server | null {
  return ioInstance
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
