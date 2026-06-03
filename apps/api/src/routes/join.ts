import { and, eq } from "drizzle-orm"
import { Router } from "express"
import {
  db,
  businessMembers,
  businessSettings,
  users,
} from "@walty/db"
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@walty/shared/api-utils/errors"
import { getIp } from "@walty/shared/api-utils/get-ip"
import {
  AUDIT_ACTIONS,
  writeAuditLog,
} from "@walty/shared/business/auditLog"
import { getBusinessContext } from "@walty/shared/business/getBusinessContext"
import {
  hasPermission,
  Permission,
  type Actor,
} from "@walty/shared/permissions"
import { rateLimitByIp, rateLimitByUser } from "@walty/shared/rate-limit"
import { logSecurityEvent } from "@walty/shared/security/logSecurityEvent"
import { asyncHandler } from "../middleware/asyncHandler.js"
import { authed } from "../middleware/typedHandlers.js"
import { withAuth } from "../middleware/withAuth.js"

export const joinRouter: Router = Router()

const JOIN_GET_RATE_LIMIT_PER_MIN = 10

// ---------- GET /join/:token (public) ----------
joinRouter.get(
  "/join/:token",
  asyncHandler(async (req, res) => {
    const ip = getIp(req)
    await rateLimitByIp(`join:${ip}`, JOIN_GET_RATE_LIMIT_PER_MIN)

    const { token } = req.params

    const member = await db.query.businessMembers.findFirst({
      where: eq(businessMembers.inviteToken, token),
      columns: {
        id: true,
        businessId: true,
        role: true,
        status: true,
        inviteEmail: true,
        expiresAt: true,
        invitedBy: true,
        userId: true,
      },
    })

    if (!member) throw new NotFoundError("invitation not found")

    if (member.status === "revoked") {
      res.json({ status: "revoked" })
      return
    }
    if (member.status === "active" || member.status === "suspended") {
      res.json({ status: "already_accepted" })
      return
    }
    if (new Date() > member.expiresAt) {
      res.json({ status: "expired" })
      return
    }

    const business = await db.query.users.findFirst({
      where: eq(users.id, member.businessId),
      columns: { email: true },
    })
    const businessSetting = await db.query.businessSettings.findFirst({
      where: eq(businessSettings.userId, member.businessId),
      columns: { name: true },
    })
    const inviter = await db.query.users.findFirst({
      where: eq(users.id, member.invitedBy),
      columns: { email: true },
    })

    res.json({
      status: "valid",
      id: member.id,
      businessId: member.businessId,
      businessName: businessSetting?.name ?? business?.email ?? "Unknown",
      role: member.role,
      invitedByName: inviter?.email ?? "Unknown",
      expiresAt: member.expiresAt.toISOString(),
    })
  }),
)

// ---------- POST /join/:token ----------
joinRouter.post(
  "/join/:token",
  withAuth,
  authed(async (req, res) => {
    const { auth } = req
    const { token } = req.params
    const ip = getIp(req)

    const existingCtx = await getBusinessContext(auth.userId)
    const actor: Actor = { type: "user", user: auth }

    if (
      !hasPermission(actor, Permission.JOIN_BUSINESS, {
        businessContext: existingCtx,
      })
    ) {
      logSecurityEvent({
        actor,
        action: "join_business",
        result: "denied_permission",
        reason: "missing_permission",
        ip,
        path: req.path,
      })
      throw new ForbiddenError(Permission.JOIN_BUSINESS)
    }

    await rateLimitByUser(auth.userId, "join-accept", 5)

    const ownerSettings = await db.query.businessSettings.findFirst({
      where: eq(businessSettings.userId, auth.userId),
      columns: { userId: true },
    })
    if (ownerSettings) {
      throw new ValidationError("business owners cannot join as operators")
    }

    const member = await db.query.businessMembers.findFirst({
      where: eq(businessMembers.inviteToken, token),
    })

    if (!member) throw new NotFoundError("invitation not found")
    if (member.status === "revoked") {
      throw new ValidationError("this invitation has been revoked")
    }
    if (member.status !== "invited") {
      throw new ConflictError("this invitation has already been used")
    }
    if (new Date() > member.expiresAt) {
      throw new ValidationError("this invitation has expired")
    }

    await db
      .update(businessMembers)
      .set({ userId: null })
      .where(
        and(
          eq(businessMembers.userId, auth.userId),
          eq(businessMembers.status, "revoked"),
        ),
      )

    const now = new Date()
    await db
      .update(businessMembers)
      .set({ userId: auth.userId, status: "active", lastActivityAt: now })
      .where(eq(businessMembers.id, member.id))

    writeAuditLog(
      member.businessId,
      auth.userId,
      AUDIT_ACTIONS.MEMBER_ACCEPTED_INVITE,
      { memberId: member.id, role: member.role },
      ip,
    )

    res.json({ ok: true, businessId: member.businessId, role: member.role })
  }),
)
