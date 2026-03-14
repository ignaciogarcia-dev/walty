import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { requireAuth } from "@/lib/auth"
import { db } from "@/server/db"
import { refundRequests } from "@/server/db/schema"
import { getBusinessContext } from "@/lib/business/getBusinessContext"
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/business/auditLog"

function getIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown"
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(req)
    const ctx = await getBusinessContext(auth.userId)

    if (!ctx?.isOwner) {
      return NextResponse.json({ error: "only business owners can approve or reject refunds" }, { status: 403 })
    }

    const { id } = await params
    const { action, txHash } = await req.json()

    const [refund] = await db
      .select()
      .from(refundRequests)
      .where(and(eq(refundRequests.id, id), eq(refundRequests.businessId, ctx.businessId)))
      .limit(1)

    if (!refund) {
      return NextResponse.json({ error: "refund request not found" }, { status: 404 })
    }

    const now = new Date()

    if (action === "approve") {
      if (refund.status !== "pending") {
        return NextResponse.json({ error: "only pending refunds can be approved" }, { status: 400 })
      }
      await db
        .update(refundRequests)
        .set({ status: "approved", reviewedAt: now, reviewedBy: auth.userId })
        .where(eq(refundRequests.id, id))

      writeAuditLog(ctx.businessId, auth.userId, AUDIT_ACTIONS.REFUND_REQUEST_APPROVED, { refundId: id }, getIp(req))
      return NextResponse.json({ ok: true })
    }

    if (action === "reject") {
      if (refund.status !== "pending") {
        return NextResponse.json({ error: "only pending refunds can be rejected" }, { status: 400 })
      }
      await db
        .update(refundRequests)
        .set({ status: "rejected", reviewedAt: now, reviewedBy: auth.userId })
        .where(eq(refundRequests.id, id))

      writeAuditLog(ctx.businessId, auth.userId, AUDIT_ACTIONS.REFUND_REQUEST_REJECTED, { refundId: id }, getIp(req))
      return NextResponse.json({ ok: true })
    }

    if (action === "mark_executed") {
      if (refund.status !== "approved") {
        return NextResponse.json({ error: "only approved refunds can be marked as executed" }, { status: 400 })
      }
      if (!txHash || typeof txHash !== "string") {
        return NextResponse.json({ error: "txHash is required" }, { status: 400 })
      }
      await db
        .update(refundRequests)
        .set({ status: "executed", txHash })
        .where(eq(refundRequests.id, id))

      writeAuditLog(ctx.businessId, auth.userId, AUDIT_ACTIONS.REFUND_REQUEST_EXECUTED, { refundId: id, txHash }, getIp(req))
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: "invalid action" }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected error"
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
