import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/server/db"
import { userProfiles } from "@/server/db/schema"
import { withErrorHandling, withAuth, ok, ValidationError, ConflictError } from "@/lib/api"

export const POST = withErrorHandling(withAuth(async (req: NextRequest, { auth }) => {
  const { displayName, username } = await req.json()
  const cleanName = displayName?.trim()

  if (!cleanName || cleanName.length < 1 || cleanName.length > 50) {
    throw new ValidationError("Invalid name")
  }

  let cleanUsername: string | undefined
  if (username) {
    const trimmed = username.trim().toLowerCase()
    if (trimmed.length < 3 || trimmed.length > 20 || !/^[a-z0-9_]+$/.test(trimmed)) {
      throw new ValidationError("Invalid username")
    }
    const existing = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.username, trimmed),
    })
    if (existing && existing.userId !== auth.userId) throw new ConflictError("Username taken")
    cleanUsername = trimmed
  }

  const existingProfile = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.userId, auth.userId),
  })

  if (existingProfile) {
    await db.update(userProfiles)
      .set({
        displayName: cleanName,
        ...(cleanUsername ? { username: cleanUsername } : {}),
      })
      .where(eq(userProfiles.userId, auth.userId))
  } else {
    await db.insert(userProfiles).values({
      userId: auth.userId,
      displayName: cleanName,
      ...(cleanUsername ? { username: cleanUsername } : {}),
    })
  }

  return ok({ ok: true, displayName: cleanName, username: cleanUsername ?? null })
}))