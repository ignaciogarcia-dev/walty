import { NextRequest } from "next/server"
import bcrypt from "bcrypt"
import { sql } from "drizzle-orm"
import { db } from "@/server/db"
import { users } from "@/server/db/schema"
import { rateLimitByIp } from "@/lib/rate-limit"
import { withErrorHandling } from "@/lib/api/with-error-handling"
import { AuthError } from "@/lib/api"
import { setTokenCookie } from "@/lib/cookie"
import { signSessionToken } from "@/lib/auth/session-token"
import { assertPasswordPolicy, normalizeEmail } from "@/lib/auth/password-policy"
import { DUMMY_PASSWORD_HASH } from "@/lib/auth/timing-bcrypt"
import { getIp } from "@/lib/api"

const LOGIN_ATTEMPTS_PER_IP_PER_MIN = 5

export const POST = withErrorHandling(async (req: NextRequest) => {
  const ip = getIp(req)
  await rateLimitByIp(`login:${ip}`, LOGIN_ATTEMPTS_PER_IP_PER_MIN)

  const body = await req.json()
  const normalizedEmail = normalizeEmail(body.email)
  const password = body.password

  if (!normalizedEmail.includes("@")) {
    throw new AuthError()
  }

  try {
    assertPasswordPolicy(password)
  } catch {
    throw new AuthError()
  }

  const [user] = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      userType: users.userType,
    })
    .from(users)
    .where(sql`lower(${users.email}) = ${normalizedEmail}`)
    .limit(1)

  const hash = user?.passwordHash ?? DUMMY_PASSWORD_HASH
  const valid = await bcrypt.compare(password, hash)

  if (!user || !valid) {
    throw new AuthError()
  }

  const token = signSessionToken({
    userId: user.id,
    userType: (user.userType as "person" | "business" | undefined) ?? "person",
  })

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": setTokenCookie(token),
    },
  })
})
