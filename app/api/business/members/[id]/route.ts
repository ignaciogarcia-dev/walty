import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/server/db"
import { businessMembers } from "@/server/db/schema"
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/business/auditLog"
import { canReactivateMember, canDeleteInvitation } from "@/lib/policies/business.policy"
import { logSecurityEvent } from "@/lib/security/logSecurityEvent"
import { operatorHasBalance } from "@/lib/business/operatorBalance"
import { withBusinessAuth, ok, ValidationError, NotFoundError } from "@/lib/api"
import { Permission } from "@/lib/permissions"

const VALID_ROLES = ["cashier"] as const
type MemberRole = typeof VALID_ROLES[number]
type RouteCtx = { params: Promise<{ id: string }> }

export const PATCH = withBusinessAuth<RouteCtx>(Permission.MEMBER_MANAGE, async (req: NextRequest, { auth, business, actor, ip, params }) => {
  const { id } = await params
  const memberId = Number(id)
  if (isNaN(memberId)) throw new ValidationError("invalid member id")

  const [member] = await db
    .select()
    .from(businessMembers)
    .where(and(eq(businessMembers.id, memberId), eq(businessMembers.businessId, business.businessId)))
    .limit(1)

  if (!member) throw new NotFoundError("member not found")

  const { action, role } = await req.json()

  if (action === "change_role") {
    if (!VALID_ROLES.includes(role as MemberRole)) {
      throw new ValidationError("role must be cashier")
    }
    const oldRole = member.role
    await db
      .update(businessMembers)
      .set({ role: role as MemberRole })
      .where(eq(businessMembers.id, memberId))

    writeAuditLog(business.businessId, auth.userId, AUDIT_ACTIONS.MEMBER_ROLE_CHANGED, { memberId, oldRole, newRole: role }, ip)
    return ok({ ok: true })
  }

  if (action === "suspend") {
    await db
      .update(businessMembers)
      .set({ status: "suspended" })
      .where(eq(businessMembers.id, memberId))

    writeAuditLog(business.businessId, auth.userId, AUDIT_ACTIONS.MEMBER_SUSPENDED, { memberId }, ip)
    return ok({ ok: true })
  }

  if (action === "revoke") {
    if (member.walletAddress) {
      const hasBalance = await operatorHasBalance(member.walletAddress)
      if (hasBalance) {
        logSecurityEvent({ actor, action: "revoke_member", result: "denied_policy", reason: "operator_has_balance", ip, path: req.nextUrl.pathname })
        throw new ValidationError("operator-has-balance")
      }
    }

    await db
      .update(businessMembers)
      .set({ status: "revoked" })
      .where(eq(businessMembers.id, memberId))

    writeAuditLog(business.businessId, auth.userId, AUDIT_ACTIONS.MEMBER_REVOKED, { memberId }, ip)
    return ok({ ok: true })
  }

  if (action === "reactivate") {
    const policy = canReactivateMember({ status: member.status })
    if (!policy.allowed) {
      logSecurityEvent({ actor, action: "reactivate_member", result: "denied_policy", reason: policy.reason, ip, path: req.nextUrl.pathname })
      throw new ValidationError(policy.reason)
    }
    await db
      .update(businessMembers)
      .set({ status: "active" })
      .where(eq(businessMembers.id, memberId))

    return ok({ ok: true })
  }

  throw new ValidationError("invalid action")
})

export const DELETE = withBusinessAuth<RouteCtx>(Permission.MEMBER_MANAGE, async (_req: NextRequest, { business, actor, ip, params }) => {
  const { id } = await params
  const memberId = Number(id)
  if (isNaN(memberId)) throw new ValidationError("invalid member id")

  const [member] = await db
    .select()
    .from(businessMembers)
    .where(and(eq(businessMembers.id, memberId), eq(businessMembers.businessId, business.businessId)))
    .limit(1)

  if (!member) throw new NotFoundError("member not found")

  const policy = canDeleteInvitation({ status: member.status })
  if (!policy.allowed) {
    logSecurityEvent({ actor, action: "delete_member", result: "denied_policy", reason: policy.reason, ip })
    throw new ValidationError(policy.reason)
  }

  await db.delete(businessMembers).where(eq(businessMembers.id, memberId))

  return ok({ ok: true })
})
