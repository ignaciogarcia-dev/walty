import { NextRequest } from "next/server"
import { and, desc, eq, inArray } from "drizzle-orm"
import { isAddress } from "viem"
import { rateLimitByUser } from "@/lib/rate-limit"
import { canRequestRefund } from "@/lib/policies/payment.policy"
import { logSecurityEvent } from "@/lib/security/logSecurityEvent"
import { db } from "@/server/db"
import { paymentRequests, refundRequests, users, userProfiles } from "@/server/db/schema"
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/business/auditLog"
import { withBusinessAuth, ok, ValidationError, NotFoundError, ConflictError } from "@/lib/api"
import { Permission } from "@/lib/permissions"

export const GET = withBusinessAuth(Permission.REFUND_REQUEST_LIST, async (req: NextRequest, { business, auth }) => {
  const { searchParams } = new URL(req.url)
  const statusParam = searchParams.get("status") || "pending"

  type RefundStatus = "pending" | "approved" | "approved_pending_signature" | "rejected" | "executed"
  let statusFilter: RefundStatus[]
  if (statusParam === "all") {
    statusFilter = ["pending", "approved_pending_signature", "rejected", "executed"]
  } else if (statusParam === "pending") {
    // "pending" filter includes both pending and approved_pending_signature for the owner panel
    statusFilter = ["pending", "approved_pending_signature"]
  } else if ((["approved_pending_signature", "rejected", "executed"] as string[]).includes(statusParam)) {
    statusFilter = [statusParam as RefundStatus]
  } else {
    statusFilter = ["pending", "approved_pending_signature"]
  }

  const refundWhereParts = [
    eq(refundRequests.businessId, business.businessId),
    inArray(refundRequests.status, statusFilter),
  ]
  // Cashiers only see refunds tied to payments collected on their operator wallet.
  if (!business.isOwner) {
    refundWhereParts.push(eq(paymentRequests.operatorId, auth.userId))
  }

  const rows = await db
    .select({
      id: refundRequests.id,
      paymentRequestId: refundRequests.paymentRequestId,
      requestedBy: refundRequests.requestedBy,
      amountToken: refundRequests.amountToken,
      amountUsd: refundRequests.amountUsd,
      destinationAddress: refundRequests.destinationAddress,
      reason: refundRequests.reason,
      status: refundRequests.status,
      txHash: refundRequests.txHash,
      txIntentId: refundRequests.txIntentId,
      createdAt: refundRequests.createdAt,
      reviewedAt: refundRequests.reviewedAt,
      tokenSymbol: paymentRequests.tokenSymbol,
      requestedByEmail: users.email,
      requestedByUsername: userProfiles.username,
    })
    .from(refundRequests)
    .innerJoin(paymentRequests, eq(refundRequests.paymentRequestId, paymentRequests.id))
    .leftJoin(users, eq(refundRequests.requestedBy, users.id))
    .leftJoin(userProfiles, eq(refundRequests.requestedBy, userProfiles.userId))
    .where(and(...refundWhereParts))
    .orderBy(desc(refundRequests.createdAt))

  return ok({
    refundRequests: rows.map((r) => ({
      id: r.id,
      paymentRequestId: r.paymentRequestId,
      requestedBy: {
        id: r.requestedBy,
        email: r.requestedByEmail,
        username: r.requestedByUsername ?? null,
      },
      amountToken: r.amountToken,
      amountUsd: r.amountUsd,
      tokenSymbol: r.tokenSymbol ?? "USDC",
      destinationAddress: r.destinationAddress,
      reason: r.reason,
      status: r.status,
      txHash: r.txHash ?? null,
      txIntentId: r.txIntentId ?? null,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
    })),
  })
})

export const POST = withBusinessAuth(Permission.REFUND_REQUEST_CREATE, async (req: NextRequest, { auth, business, actor, ip }) => {
  await rateLimitByUser(auth.userId, 5)

  const { paymentRequestId, destinationAddress, reason, amountToken: overrideToken, amountUsd: overrideUsd } = await req.json()

  if (!paymentRequestId || typeof paymentRequestId !== "string") {
    throw new ValidationError("paymentRequestId is required")
  }

  if (!destinationAddress || !isAddress(destinationAddress)) {
    throw new ValidationError("invalid destination address")
  }

  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    throw new ValidationError("reason is required")
  }

  const [payment] = await db
    .select()
    .from(paymentRequests)
    .where(
      and(
        eq(paymentRequests.id, paymentRequestId),
        eq(paymentRequests.merchantId, business.businessId)
      )
    )
    .limit(1)

  if (!payment) throw new NotFoundError("payment request not found")

  const policy = canRequestRefund({ status: payment.status, merchantId: payment.merchantId }, business)
  if (!policy.allowed) {
    logSecurityEvent({ actor, action: "request_refund", result: "denied_policy", reason: policy.reason, ip, path: req.nextUrl.pathname })
    throw new ValidationError(policy.reason)
  }

  // Allow partial refund amounts (e.g. surplus refunds) — validate if provided
  let finalAmountToken = payment.amountToken
  let finalAmountUsd = payment.amountUsd

  if (overrideToken && overrideUsd) {
    const overrideBigInt = BigInt(overrideToken)
    if (overrideBigInt <= 0n) {
      throw new ValidationError("invalid refund amount")
    }
    // Cap to receivedAmountToken when available (surplus refunds)
    const receivedBigInt = payment.receivedAmountToken ? BigInt(payment.receivedAmountToken) : null
    if (receivedBigInt !== null && overrideBigInt > receivedBigInt) {
      throw new ValidationError("refund amount exceeds received amount")
    }
    finalAmountToken = String(overrideToken)
    finalAmountUsd = String(overrideUsd)
  }

  const [existing] = await db
    .select({ id: refundRequests.id })
    .from(refundRequests)
    .where(
      and(
        eq(refundRequests.paymentRequestId, paymentRequestId),
        inArray(refundRequests.status, ["pending", "approved_pending_signature"])
      )
    )
    .limit(1)

  if (existing) throw new ConflictError("a refund request is already pending for this payment")

  const [refund] = await db
    .insert(refundRequests)
    .values({
      paymentRequestId,
      requestedBy: auth.userId,
      businessId: business.businessId,
      amountToken: finalAmountToken,
      amountUsd: finalAmountUsd,
      destinationAddress,
      reason: reason.trim(),
    })
    .returning()

  writeAuditLog(
    business.businessId,
    auth.userId,
    AUDIT_ACTIONS.REFUND_REQUEST_CREATED,
    { refundId: refund.id, paymentRequestId, amountUsd: refund.amountUsd },
    ip
  )

  return ok({ ok: true, id: refund.id })
})
