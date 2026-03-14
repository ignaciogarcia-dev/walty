import { NextRequest, NextResponse } from "next/server"
import { and, desc, eq, inArray } from "drizzle-orm"
import { isAddress } from "viem"
import { requireAuth } from "@/lib/auth"
import { db } from "@/server/db"
import { paymentRequests, refundRequests, users, userProfiles } from "@/server/db/schema"
import { getBusinessContext } from "@/lib/business/getBusinessContext"
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/business/auditLog"

function getIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown"
}

export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req)
    const ctx = await getBusinessContext(auth.userId)

    if (!ctx) {
      return NextResponse.json({ error: "no business context" }, { status: 403 })
    }

    // Only owner and manager can view refund requests
    if (!ctx.isOwner && ctx.role !== "manager") {
      return NextResponse.json({ error: "insufficient permissions" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const statusParam = searchParams.get("status") || "pending"

    type RefundStatus = "pending" | "approved" | "rejected" | "executed"
    let statusFilter: RefundStatus[]
    if (statusParam === "all") {
      statusFilter = ["pending", "approved", "rejected", "executed"]
    } else if (["pending", "approved", "rejected", "executed"].includes(statusParam)) {
      statusFilter = [statusParam as RefundStatus]
    } else {
      statusFilter = ["pending"]
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
        createdAt: refundRequests.createdAt,
        reviewedAt: refundRequests.reviewedAt,
        tokenSymbol: paymentRequests.tokenSymbol,
        requestedByEmail: users.email,
        requestedByUsername: userProfiles.username,
      })
      .from(refundRequests)
      .leftJoin(paymentRequests, eq(refundRequests.paymentRequestId, paymentRequests.id))
      .leftJoin(users, eq(refundRequests.requestedBy, users.id))
      .leftJoin(userProfiles, eq(refundRequests.requestedBy, userProfiles.userId))
      .where(
        and(
          eq(refundRequests.businessId, ctx.businessId),
          inArray(refundRequests.status, statusFilter)
        )
      )
      .orderBy(desc(refundRequests.createdAt))

    return NextResponse.json({
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
        createdAt: r.createdAt.toISOString(),
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected error"
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = requireAuth(req)
    const ctx = await getBusinessContext(auth.userId)

    if (!ctx) {
      return NextResponse.json({ error: "no business context" }, { status: 403 })
    }

    // Only owner and manager can request refunds
    if (!ctx.isOwner && ctx.role !== "manager") {
      return NextResponse.json({ error: "only managers and owners can request refunds" }, { status: 403 })
    }

    const { paymentRequestId, destinationAddress, reason } = await req.json()

    if (!paymentRequestId || typeof paymentRequestId !== "string") {
      return NextResponse.json({ error: "paymentRequestId is required" }, { status: 400 })
    }

    if (!destinationAddress || !isAddress(destinationAddress)) {
      return NextResponse.json({ error: "invalid destination address" }, { status: 400 })
    }

    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      return NextResponse.json({ error: "reason is required" }, { status: 400 })
    }

    // Verify the payment request belongs to this business and is paid
    const [payment] = await db
      .select()
      .from(paymentRequests)
      .where(
        and(
          eq(paymentRequests.id, paymentRequestId),
          eq(paymentRequests.merchantId, ctx.businessId)
        )
      )
      .limit(1)

    if (!payment) {
      return NextResponse.json({ error: "payment request not found" }, { status: 404 })
    }

    if (payment.status !== "paid") {
      return NextResponse.json({ error: "can only refund paid payment requests" }, { status: 400 })
    }

    // Check for existing pending/approved refund
    const [existing] = await db
      .select({ id: refundRequests.id })
      .from(refundRequests)
      .where(
        and(
          eq(refundRequests.paymentRequestId, paymentRequestId),
          inArray(refundRequests.status, ["pending", "approved"])
        )
      )
      .limit(1)

    if (existing) {
      return NextResponse.json({ error: "a refund request is already pending for this payment" }, { status: 409 })
    }

    const [refund] = await db
      .insert(refundRequests)
      .values({
        paymentRequestId,
        requestedBy: auth.userId,
        businessId: ctx.businessId,
        amountToken: payment.amountToken,
        amountUsd: payment.amountUsd,
        destinationAddress,
        reason: reason.trim(),
      })
      .returning()

    writeAuditLog(
      ctx.businessId,
      auth.userId,
      AUDIT_ACTIONS.REFUND_REQUEST_CREATED,
      { refundId: refund.id, paymentRequestId, amountUsd: refund.amountUsd },
      getIp(req)
    )

    return NextResponse.json({ ok: true, id: refund.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected error"
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
