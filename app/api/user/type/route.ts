import { NextRequest } from "next/server"
import { db } from "@/server/db"
import { users } from "@/server/db/schema"
import { eq } from "drizzle-orm"
import { withErrorHandling, withAuth, ValidationError } from "@/lib/api"
import { rateLimitByUser } from "@/lib/rate-limit"
import { setTokenCookie } from "@/lib/cookie"
import { signSessionToken } from "@/lib/auth/session-token"

export const PATCH = withErrorHandling(withAuth(async (req: NextRequest, { auth }) => {
  await rateLimitByUser(auth.userId, 5, 60_000)

  const { userType } = await req.json()

  if (userType !== "person" && userType !== "business") {
    throw new ValidationError("invalid userType")
  }

  await db.update(users).set({ userType }).where(eq(users.id, auth.userId))

  const token = signSessionToken({
    userId: auth.userId,
    userType,
  })

  return new Response(JSON.stringify({ ok: true, userType }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": setTokenCookie(token),
    },
  })
}))
