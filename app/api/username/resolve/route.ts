import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/server/db"
import { userProfiles, addresses } from "@/server/db/schema"
import { withErrorHandling, withAuth, ok, ValidationError, NotFoundError } from "@/lib/api"

export const GET = withErrorHandling(withAuth(async (req: NextRequest) => {
  const username = req.nextUrl.searchParams.get("username")?.trim().toLowerCase()

  if (!username || username.length < 3 || username.length > 20 || !/^[a-z0-9_]+$/.test(username)) {
    throw new ValidationError("Invalid username")
  }

  const profile = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.username, username),
  })

  if (!profile) throw new NotFoundError("Username not found")

  const addr = await db.query.addresses.findFirst({
    where: eq(addresses.userId, profile.userId),
  })

  if (!addr) throw new NotFoundError("No wallet linked to this user")

  return ok({ address: addr.address })
}))
