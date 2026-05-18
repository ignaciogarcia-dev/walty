/**
 * Reconciler / route emit events for the /payment-requests WS namespace.
 * Defined here (not in apps/api) so the shared reconciler can produce
 * typed events without coupling to socket.io.
 */
export type PaymentRequestEvent =
  | { type: "detected"; requestId: string; txHash: string }
  | {
      type: "confirming"
      requestId: string
      confirmations: number
      requiredConfirmations: number
    }
  | {
      type: "paid"
      requestId: string
      txHash: string
      amount: string
      merchantId: number
    }
  | { type: "expired"; requestId: string; merchantId: number }
  | { type: "cancelled"; requestId: string; merchantId: number }

export type PaymentRequestEventSink = (event: PaymentRequestEvent) => void
