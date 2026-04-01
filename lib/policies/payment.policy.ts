import type { BusinessContext } from "@/lib/business/getBusinessContext"
import { allow, deny, type PolicyResult } from "./types"

export function canCancelPayment(
  payment: { status: string; merchantId: number },
  ctx: BusinessContext
): PolicyResult {
  if (payment.merchantId !== ctx.businessId) return deny("payment_not_owned")
  if (payment.status !== "pending") return deny("payment_not_pending")
  return allow
}

export function canRequestRefund(
  payment: { status: string; merchantId: number },
  ctx: BusinessContext
): PolicyResult {
  if (payment.merchantId !== ctx.businessId) return deny("payment_not_owned")
  if (payment.status !== "paid") return deny("payment_not_paid")
  return allow
}

export function canApproveRefund(refund: { status: string }): PolicyResult {
  return refund.status === "pending" ? allow : deny("refund_not_pending")
}

export function canRejectRefund(refund: { status: string }): PolicyResult {
  return refund.status === "pending" ? allow : deny("refund_not_pending")
}

export function canExecuteRefund(refund: { status: string }): PolicyResult {
  return refund.status === "approved_pending_signature" ? allow : deny("refund_not_approved")
}
