import type { Server as HttpServer } from "node:http"
import { Server } from "socket.io"
import { verifySessionToken } from "@walty/shared/auth/session-token"
import { env } from "../config/env.js"
import { logger } from "../config/logger.js"

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
    socket.on("subscribe", (intentId: unknown) => {
      if (typeof intentId !== "string" || intentId.length === 0) return
      socket.join(`intent:${intentId}`)
    })
    socket.on("unsubscribe", (intentId: unknown) => {
      if (typeof intentId !== "string" || intentId.length === 0) return
      socket.leave(`intent:${intentId}`)
    })
  })

  // /payment-requests namespace — public, room per request id.
  // Anyone with the requestId (which lives in the QR) can subscribe.
  const paymentNs = io.of("/payment-requests")
  paymentNs.on("connection", (socket) => {
    socket.on("subscribe", (requestId: unknown) => {
      if (typeof requestId !== "string" || requestId.length === 0) return
      socket.join(`request:${requestId}`)
    })
    socket.on("unsubscribe", (requestId: unknown) => {
      if (typeof requestId !== "string" || requestId.length === 0) return
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

export type PaymentRequestEvent =
  | { type: "detected"; requestId: string; txHash: string }
  | {
      type: "confirming"
      requestId: string
      confirmations: number
      requiredConfirmations: number
    }
  | { type: "paid"; requestId: string; txHash: string; amount: string }
  | { type: "expired"; requestId: string }
  | { type: "cancelled"; requestId: string }

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
