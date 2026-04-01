import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/server/db"
import { businessMembers, users, userProfiles } from "@/server/db/schema"
import { getBusinessContext } from "@/lib/business/getBusinessContext"
import { hasPermission, Permission, type Actor } from "@/lib/permissions"
import { logSecurityEvent } from "@/lib/security/logSecurityEvent"
import { rateLimitByUser, rateLimitByIp } from "@/lib/rate-limit"
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/business/auditLog"
import { withErrorHandling, withAuth, getIp, ok, ForbiddenError, ValidationError, NotFoundError, ConflictError } from "@/lib/api"

type RouteCtx = { params: Promise<{ token: string }> }

const JOIN_GET_RATE_LIMIT_PER_MIN = 10

// GET is public — no auth required; rate limit by IP to avoid abuse
export const GET = withErrorHandling(async (
  req: NextRequest,
  { params }: RouteCtx
) => {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown"
  await rateLimitByIp(`join:${ip}`, JOIN_GET_RATE_LIMIT_PER_MIN)

  const { token } = await params

  const member = await db.query.businessMembers.findFirst({
    where: eq(businessMembers.inviteToken, token),
    columns: {
      id: true, businessId: true, role: true, status: true, inviteEmail: true, expiresAt: true, invitedBy: true, userId: true,
    },
  })

  if (!member) throw new NotFoundError("invitation not found")

  if (member.status === "revoked") return ok({ status: "revoked" })

  if (member.status === "active" || member.status === "suspended") return ok({ status: "already_accepted" })

  if (new Date() > member.expiresAt) return ok({ status: "expired" })

  const business = await db.query.users.findFirst({
    where: eq(users.id, member.businessId),
    columns: { email: true },
  })
  const businessProfile = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.userId, member.businessId),
    columns: { username: true },
  })

  const inviter = await db.query.users.findFirst({
    where: eq(users.id, member.invitedBy),
    columns: { email: true },
  })
  const inviterProfile = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.userId, member.invitedBy),
    columns: { username: true },
  })

  return ok({
    status: "valid",
    id: member.id,
    businessId: member.businessId,
    businessName: businessProfile?.username ?? business?.email ?? "Unknown",
    role: member.role,
    invitedByName: inviterProfile?.username ?? inviter?.email ?? "Unknown",
    expiresAt: member.expiresAt.toISOString(),
  })
})

// POST: auth required, manual JOIN_BUSINESS check
// (inverse permission: JOIN_BUSINESS is granted when user has NO existing business context)
export const POST = withErrorHandling<RouteCtx>(withAuth<RouteCtx>(async (req: NextRequest, { auth, params }) => {
  const { token } = await params

  const existingCtx = await getBusinessContext(auth.userId)
  const actor: Actor = { type: "user", user: auth }

  if (!hasPermission(actor, Permission.JOIN_BUSINESS, { businessContext: existingCtx })) {
    logSecurityEvent({ actor, action: "join_business", result: "denied_permission", reason: "missing_permission", ip: getIp(req), path: req.nextUrl.pathname })
    throw new ForbiddenError(Permission.JOIN_BUSINESS)
  }

  await rateLimitByUser(auth.userId, 5)

  const user = await db.query.users.findFirst({
    where: eq(users.id, auth.userId),
    columns: { userType: true },
  })

  if (user?.userType === "business") {
    throw new ValidationError("business accounts cannot join as operators")
  }

  const member = await db.query.businessMembers.findFirst({
    where: eq(businessMembers.inviteToken, token),
  })

  if (!member) {
    throw new NotFoundError("invitation not found")
  }

  if (member.status === "revoked") {
    throw new ValidationError("this invitation has been revoked")
  }

  if (member.status !== "invited") {
    throw new ConflictError("this invitation has already been used")
  }

  if (new Date() > member.expiresAt) {
    throw new ValidationError("this invitation has expired")
  }

  // Clear userId from any previous revoked membership to avoid UNIQUE constraint violation
  await db
    .update(businessMembers)
    .set({ userId: null })
    .where(and(eq(businessMembers.userId, auth.userId), eq(businessMembers.status, "revoked")))

  const now = new Date()
  await db
    .update(businessMembers)
    .set({ userId: auth.userId, status: "active", lastActivityAt: now })
    .where(eq(businessMembers.id, member.id))

  if (!user?.userType) {
    await db.update(users).set({ userType: "person" }).where(eq(users.id, auth.userId))
  }

  writeAuditLog(
    member.businessId,
    auth.userId,
    AUDIT_ACTIONS.MEMBER_ACCEPTED_INVITE,
    { memberId: member.id, role: member.role },
    getIp(req)
  )

  return ok({ ok: true, businessId: member.businessId, role: member.role })
}))
