import type { PaymentRequestEvent } from "@walty/shared/payments/events"
import {
  emitBusinessActiveChanged,
  emitPaymentRequestEvent,
} from "./io.js"

/**
 * Shared sink for `reconcilePendingPaymentRequests({ onEvent })`. Forwards
 * per-request events to the /payment-requests namespace and also fans
 * "active-changed" out to the matching business room whenever a request
 * transitions to a non-active state.
 */
export function reconcilerSink(event: PaymentRequestEvent): void {
  emitPaymentRequestEvent(event)
  if (
    event.type === "paid" ||
    event.type === "expired" ||
    event.type === "cancelled"
  ) {
    emitBusinessActiveChanged(event.merchantId)
  }
}
