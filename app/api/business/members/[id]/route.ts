import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { requireAuth } from "@/lib/auth"
import { db } from "@/server/db"
import { businessMembers } from "@/server/db/schema"
import { getBusinessContext } from "@/lib/business/getBusinessContext"
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/business/auditLog"

const VALID_ROLES = ["manager", "cashier", "waiter"] as const
type MemberRole = typeof VALID_ROLES[number]

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
      return NextResponse.json({ error: "only business owners can manage members" }, { status: 403 })
    }

    const { id } = await params
    const memberId = Number(id)
    if (isNaN(memberId)) {
      return NextResponse.json({ error: "invalid member id" }, { status: 400 })
    }

    const [member] = await db
      .select()
      .from(businessMembers)
      .where(and(eq(businessMembers.id, memberId), eq(businessMembers.businessId, ctx.businessId)))
      .limit(1)

    if (!member) {
      return NextResponse.json({ error: "member not found" }, { status: 404 })
    }

    const { action, role } = await req.json()

    if (action === "change_role") {
      if (!VALID_ROLES.includes(role as MemberRole)) {
        return NextResponse.json({ error: "role must be manager, cashier, or waiter" }, { status: 400 })
      }
      const oldRole = member.role
      await db
        .update(businessMembers)
        .set({ role: role as MemberRole })
        .where(eq(businessMembers.id, memberId))

      writeAuditLog(ctx.businessId, auth.userId, AUDIT_ACTIONS.MEMBER_ROLE_CHANGED, { memberId, oldRole, newRole: role }, getIp(req))
      return NextResponse.json({ ok: true })
    }

    if (action === "suspend") {
      await db
        .update(businessMembers)
        .set({ status: "suspended" })
        .where(eq(businessMembers.id, memberId))

      writeAuditLog(ctx.businessId, auth.userId, AUDIT_ACTIONS.MEMBER_SUSPENDED, { memberId }, getIp(req))
      return NextResponse.json({ ok: true })
    }

    if (action === "revoke") {
      await db
        .update(businessMembers)
        .set({ status: "revoked" })
        .where(eq(businessMembers.id, memberId))

      writeAuditLog(ctx.businessId, auth.userId, AUDIT_ACTIONS.MEMBER_REVOKED, { memberId }, getIp(req))
      return NextResponse.json({ ok: true })
    }

    if (action === "reactivate") {
      if (member.status !== "suspended") {
        return NextResponse.json({ error: "only suspended members can be reactivated" }, { status: 400 })
      }
      await db
        .update(businessMembers)
        .set({ status: "active" })
        .where(eq(businessMembers.id, memberId))
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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(req)
    const ctx = await getBusinessContext(auth.userId)

    if (!ctx?.isOwner) {
      return NextResponse.json({ error: "only business owners can remove members" }, { status: 403 })
    }

    const { id } = await params
    const memberId = Number(id)
    if (isNaN(memberId)) {
      return NextResponse.json({ error: "invalid member id" }, { status: 400 })
    }

    const [member] = await db
      .select()
      .from(businessMembers)
      .where(and(eq(businessMembers.id, memberId), eq(businessMembers.businessId, ctx.businessId)))
      .limit(1)

    if (!member) {
      return NextResponse.json({ error: "member not found" }, { status: 404 })
    }

    if (member.status !== "invited") {
      return NextResponse.json({ error: "only pending invitations can be deleted; use revoke for active members" }, { status: 400 })
    }

    await db.delete(businessMembers).where(eq(businessMembers.id, memberId))

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected error"
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
