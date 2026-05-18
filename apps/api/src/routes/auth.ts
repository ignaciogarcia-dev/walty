import bcrypt from "bcrypt"
import { eq, sql } from "drizzle-orm"
import { Router } from "express"
import { db, users, businessMembers } from "@walty/db"
import {
  AuthError,
  ConflictError,
  ValidationError,
} from "@walty/shared/api-utils/errors"
import { getIp } from "@walty/shared/api-utils/get-ip"
import { BCRYPT_ROUNDS } from "@walty/shared/auth/constants"
import {
  clearTokenCookie,
  setTokenCookie,
} from "@walty/shared/auth/cookie"
import {
  assertPasswordPolicy,
  normalizeEmail,
} from "@walty/shared/auth/password-policy"
import { signSessionToken } from "@walty/shared/auth/session-token"
import { DUMMY_PASSWORD_HASH } from "@walty/shared/auth/timing-bcrypt"
import {
  AUDIT_ACTIONS,
  writeAuditLog,
} from "@walty/shared/business/auditLog"
import { isUniqueViolation } from "@walty/shared/db-errors"
import { rateLimitByIp } from "@walty/shared/rate-limit"
import { asyncHandler } from "../middleware/asyncHandler.js"

export const authRouter: Router = Router()

const LOGIN_ATTEMPTS_PER_IP_PER_MIN = 5

authRouter.post(
  "/auth/login",
  asyncHandler(async (req, res) => {
    const ip = getIp(req)
    await rateLimitByIp(`login:${ip}`, LOGIN_ATTEMPTS_PER_IP_PER_MIN)

    const body = req.body ?? {}
    const normalizedEmail = normalizeEmail(body.email)
    const password = body.password

    if (!normalizedEmail.includes("@")) throw new AuthError()
    try {
      assertPasswordPolicy(password)
    } catch {
      throw new AuthError()
    }

    const [user] = await db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(sql`lower(${users.email}) = ${normalizedEmail}`)
      .limit(1)

    const hash = user?.passwordHash ?? DUMMY_PASSWORD_HASH
    const valid = await bcrypt.compare(password, hash)

    if (!user || !valid) throw new AuthError()

    const token = signSessionToken({ userId: user.id })
    res.setHeader("Set-Cookie", setTokenCookie(token))
    res.json({ ok: true })
  }),
)

authRouter.post(
  "/auth/register",
  asyncHandler(async (req, res) => {
    const ip = getIp(req)
    await rateLimitByIp(`register:${ip}`, 20)

    const { email, password, inviteToken } = req.body ?? {}
    const cleanEmail = normalizeEmail(email)

    if (!cleanEmail.includes("@")) {
      throw new ValidationError("invalid-email-or-password")
    }
    assertPasswordPolicy(password)

    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, cleanEmail),
    })
    if (existingUser) throw new ConflictError("email-already-in-use")

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS)

    if (inviteToken) {
      let newUserId!: number
      let memberSnap!: typeof businessMembers.$inferSelect
      try {
        await db.transaction(async (tx) => {
          const [row] = await tx
            .select()
            .from(businessMembers)
            .where(eq(businessMembers.inviteToken, inviteToken))
            .for("update")

          if (!row || row.status !== "invited" || new Date() > row.expiresAt) {
            throw new ValidationError("invalid-or-expired-invite")
          }
          if (row.inviteEmail && row.inviteEmail !== cleanEmail) {
            throw new ValidationError("invite-email-mismatch")
          }

          const [user] = await tx
            .insert(users)
            .values({ email: cleanEmail, passwordHash: hash })
            .returning()

          await tx
            .update(businessMembers)
            .set({
              userId: user.id,
              status: "active",
              lastActivityAt: new Date(),
            })
            .where(eq(businessMembers.id, row.id))

          newUserId = user.id
          memberSnap = row
        })
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictError("email-already-in-use")
        throw err
      }

      writeAuditLog(
        memberSnap.businessId,
        newUserId,
        AUDIT_ACTIONS.MEMBER_ACCEPTED_INVITE,
        { memberId: memberSnap.id, role: memberSnap.role },
        ip,
      )

      const token = signSessionToken({ userId: newUserId })
      res.setHeader("Set-Cookie", setTokenCookie(token))
      res.json({ ok: true, hasActiveBusiness: true })
      return
    }

    let inserted
    try {
      inserted = await db
        .insert(users)
        .values({ email: cleanEmail, passwordHash: hash })
        .returning()
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError("email-already-in-use")
      throw err
    }

    const token = signSessionToken({ userId: inserted[0].id })
    res.setHeader("Set-Cookie", setTokenCookie(token))
    res.json({ ok: true })
  }),
)

authRouter.post("/auth/logout", (_req, res) => {
  res.setHeader("Set-Cookie", clearTokenCookie())
  res.json({ ok: true })
})
