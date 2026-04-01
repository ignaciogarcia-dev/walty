import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/server/db"
import { userProfiles } from "@/server/db/schema"
import { withErrorHandling, withAuth, ok } from "@/lib/api"
import { rateLimitByUser } from "@/lib/rate-limit"

export const GET = withErrorHandling(withAuth(async (req: NextRequest, { auth }) => {
  await rateLimitByUser(auth.userId, 20, 60_000)

  const username = req.nextUrl.searchParams.get("username")?.trim().toLowerCase()

  if (!username || username.length < 3 || username.length > 20 || !/^[a-z0-9_]+$/.test(username)) {
    return ok({ available: false })
  }

  const existing = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.username, username),
  })

  return ok({ available: !existing })
}))
