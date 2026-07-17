import { describe, expect, it } from "vitest"

import {
  toPublicPaymentRequestEvent,
  type PaymentRequestEvent,
} from "./events.js"

// The /payment-requests WS namespace is public (anyone with the requestId can
// subscribe). The public projection must never carry internal identifiers —
// notably merchantId, the owner's internal user id.
describe("toPublicPaymentRequestEvent", () => {
  it("strips merchantId from paid events (keeps txHash + amount)", () => {
    const internal: PaymentRequestEvent = {
      type: "paid",
      requestId: "req-1",
      txHash: "0xabc",
      amount: "9.50",
      merchantId: 42,
    }
    const pub = toPublicPaymentRequestEvent(internal)
    expect(pub).toEqual({
      type: "paid",
      requestId: "req-1",
      txHash: "0xabc",
      amount: "9.50",
    })
    expect("merchantId" in pub).toBe(false)
  })

  it("strips merchantId from expired and cancelled events", () => {
    for (const type of ["expired", "cancelled"] as const) {
      const pub = toPublicPaymentRequestEvent({
        type,
        requestId: "req-2",
        merchantId: 7,
      })
      expect(pub).toEqual({ type, requestId: "req-2" })
      expect("merchantId" in pub).toBe(false)
    }
  })

  it("passes through detected and confirming unchanged (no internal ids on them)", () => {
    expect(
      toPublicPaymentRequestEvent({
        type: "detected",
        requestId: "req-3",
        txHash: "0xdef",
      }),
    ).toEqual({ type: "detected", requestId: "req-3", txHash: "0xdef" })

    expect(
      toPublicPaymentRequestEvent({
        type: "confirming",
        requestId: "req-4",
        confirmations: 1,
        requiredConfirmations: 2,
      }),
    ).toEqual({
      type: "confirming",
      requestId: "req-4",
      confirmations: 1,
      requiredConfirmations: 2,
    })
  })

  it("never leaks merchantId for any event type carrying it", () => {
    const withMerchant: PaymentRequestEvent[] = [
      { type: "paid", requestId: "r", txHash: "0x", amount: "1", merchantId: 1 },
      { type: "expired", requestId: "r", merchantId: 1 },
      { type: "cancelled", requestId: "r", merchantId: 1 },
    ]
    for (const e of withMerchant) {
      expect(JSON.stringify(toPublicPaymentRequestEvent(e))).not.toContain(
        "merchantId",
      )
    }
  })
})
