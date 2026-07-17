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

/**
 * Shape broadcast to the PUBLIC /payment-requests WS namespace. Mirrors
 * PaymentRequestEvent minus any internal identifier — notably `merchantId`
 * (the owner's internal user id), which the browser client does not consume.
 */
export type PublicPaymentRequestEvent =
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

/**
 * Project an internal event to the public shape sent over the unauthenticated
 * /payment-requests namespace. Whitelists fields per type (rather than deleting
 * merchantId) so a future sensitive field added to PaymentRequestEvent cannot
 * silently leak. The in-process event keeps merchantId for authed server-side
 * consumers (e.g. reconcilerSink's business-room notify).
 */
export function toPublicPaymentRequestEvent(
  event: PaymentRequestEvent,
): PublicPaymentRequestEvent {
  switch (event.type) {
    case "detected":
      return {
        type: "detected",
        requestId: event.requestId,
        txHash: event.txHash,
      }
    case "confirming":
      return {
        type: "confirming",
        requestId: event.requestId,
        confirmations: event.confirmations,
        requiredConfirmations: event.requiredConfirmations,
      }
    case "paid":
      return {
        type: "paid",
        requestId: event.requestId,
        txHash: event.txHash,
        amount: event.amount,
      }
    case "expired":
      return { type: "expired", requestId: event.requestId }
    case "cancelled":
      return { type: "cancelled", requestId: event.requestId }
  }
}
