import { describe, expect, it } from "vitest"
import {
  canCancelPayment,
  canRequestRefund,
  canApproveRefund,
  canRejectRefund,
  canExecuteRefund,
} from "./payment.policy"
import type { BusinessContext } from "@/lib/business/getBusinessContext"

const ctx = { businessId: 10 } as BusinessContext
const otherCtx = { businessId: 99 } as BusinessContext

const pendingPayment = { status: "pending", merchantId: 10 }
const paidPayment = { status: "paid", merchantId: 10 }
const expiredPayment = { status: "expired", merchantId: 10 }

describe("canCancelPayment", () => {
  it("allows cancellation of a pending payment owned by the business", () => {
    expect(canCancelPayment(pendingPayment, ctx)).toEqual({ allowed: true })
  })

  it("denies when payment belongs to another business", () => {
    expect(canCancelPayment(pendingPayment, otherCtx)).toEqual({
      allowed: false,
      reason: "payment_not_owned",
    })
  })

  it("denies when payment is not pending (paid)", () => {
    expect(canCancelPayment(paidPayment, ctx)).toEqual({
      allowed: false,
      reason: "payment_not_pending",
    })
  })

  it("denies when payment is not pending (expired)", () => {
    expect(canCancelPayment(expiredPayment, ctx)).toEqual({
      allowed: false,
      reason: "payment_not_pending",
    })
  })
})

describe("canRequestRefund", () => {
  it("allows refund request on a paid payment owned by the business", () => {
    expect(canRequestRefund(paidPayment, ctx)).toEqual({ allowed: true })
  })

  it("denies when payment belongs to another business", () => {
    expect(canRequestRefund(paidPayment, otherCtx)).toEqual({
      allowed: false,
      reason: "payment_not_owned",
    })
  })

  it("denies when payment is not paid (pending)", () => {
    expect(canRequestRefund(pendingPayment, ctx)).toEqual({
      allowed: false,
      reason: "payment_not_paid",
    })
  })

  it("denies when payment is not paid (expired)", () => {
    expect(canRequestRefund(expiredPayment, ctx)).toEqual({
      allowed: false,
      reason: "payment_not_paid",
    })
  })
})

describe("canApproveRefund", () => {
  it("allows approval of a pending refund", () => {
    expect(canApproveRefund({ status: "pending" })).toEqual({ allowed: true })
  })

  it("denies when refund is already approved", () => {
    expect(canApproveRefund({ status: "approved_pending_signature" })).toEqual({
      allowed: false,
      reason: "refund_not_pending",
    })
  })

  it("denies when refund is rejected", () => {
    expect(canApproveRefund({ status: "rejected" })).toEqual({
      allowed: false,
      reason: "refund_not_pending",
    })
  })

  it("denies when refund is already executed", () => {
    expect(canApproveRefund({ status: "executed" })).toEqual({
      allowed: false,
      reason: "refund_not_pending",
    })
  })
})

describe("canRejectRefund", () => {
  it("allows rejection of a pending refund", () => {
    expect(canRejectRefund({ status: "pending" })).toEqual({ allowed: true })
  })

  it("denies when refund is not pending", () => {
    expect(canRejectRefund({ status: "approved_pending_signature" })).toEqual({
      allowed: false,
      reason: "refund_not_pending",
    })
  })
})

describe("canExecuteRefund", () => {
  it("allows execution of an approved-pending-signature refund", () => {
    expect(canExecuteRefund({ status: "approved_pending_signature" })).toEqual({ allowed: true })
  })

  it("denies when refund is still pending (not yet approved)", () => {
    expect(canExecuteRefund({ status: "pending" })).toEqual({
      allowed: false,
      reason: "refund_not_approved",
    })
  })

  it("denies when refund is rejected", () => {
    expect(canExecuteRefund({ status: "rejected" })).toEqual({
      allowed: false,
      reason: "refund_not_approved",
    })
  })

  it("denies when refund is already executed", () => {
    expect(canExecuteRefund({ status: "executed" })).toEqual({
      allowed: false,
      reason: "refund_not_approved",
    })
  })
})
