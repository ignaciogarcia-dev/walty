import type { Server as HttpServer } from "node:http"
import { Server } from "socket.io"
import { env } from "../config/env.js"
import { logger } from "../config/logger.js"

let ioInstance: Server | null = null

export function initWebSocket(httpServer: HttpServer): Server {
  if (ioInstance) return ioInstance

  const io = new Server(httpServer, {
    cors: { origin: env.webOrigin, credentials: true },
    serveClient: false,
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
