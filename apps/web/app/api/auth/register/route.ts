import { NextRequest } from "next/server"
import bcrypt from "bcrypt"
import { eq } from "drizzle-orm"
import { db } from "@walty/db"
import { users, businessMembers } from "@walty/db"
import { rateLimitByIp } from "@/lib/rate-limit"
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/business/auditLog"
import { withErrorHandling } from "@/lib/api/with-error-handling"
import { ValidationError, ConflictError } from "@/lib/api"
import { isUniqueViolation } from "@walty/shared/db-errors"
import { setTokenCookie } from "@/lib/cookie"
import { signSessionToken } from "@/lib/auth/session-token"
import { assertPasswordPolicy, normalizeEmail } from "@/lib/auth/password-policy"
import { BCRYPT_ROUNDS } from "@/lib/auth/constants"
import { getIp } from "@/lib/api"

export const POST = withErrorHandling(async (req: NextRequest) => {
  const ip = getIp(req)
  await rateLimitByIp(`register:${ip}`, 20)

  const { email, password, inviteToken } = await req.json()
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
          .set({ userId: user.id, status: "active", lastActivityAt: new Date() })
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
      ip
    )

    const token = signSessionToken({ userId: newUserId })
    return new Response(JSON.stringify({ ok: true, hasActiveBusiness: true }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": setTokenCookie(token),
      },
    })
  }

  let inserted
  try {
    inserted = await db.insert(users).values({ email: cleanEmail, passwordHash: hash }).returning()
  } catch (error: unknown) {
    if (isUniqueViolation(error)) throw new ConflictError("email-already-in-use")
    throw error
  }

  const token = signSessionToken({ userId: inserted[0].id })

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": setTokenCookie(token),
    },
  })
})
