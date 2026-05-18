import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/server/db"
import { businessSettings, businessMembers } from "@/server/db/schema"
import { withErrorHandling, withAuth, ok, ValidationError, ConflictError } from "@/lib/api"
import { rateLimitByUser } from "@/lib/rate-limit"

export const GET = withErrorHandling(withAuth(async (_req: NextRequest, { auth }) => {
  const [settings] = await db
    .select()
    .from(businessSettings)
    .where(eq(businessSettings.userId, auth.userId))
    .limit(1)

  return ok({ settings: settings ?? null })
}))

export const POST = withErrorHandling(withAuth(async (req: NextRequest, { auth }) => {
  await rateLimitByUser(auth.userId, 10, 60_000)

  const body = await req.json().catch(() => ({}))
  const name = typeof body?.name === "string" ? body.name.trim() : ""

  if (name.length < 2 || name.length > 80) {
    throw new ValidationError("business name must be 2-80 characters")
  }

  const [membership] = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(eq(businessMembers.userId, auth.userId))
    .limit(1)

  if (membership) {
    throw new ConflictError("operators cannot own a business")
  }

  await db
    .insert(businessSettings)
    .values({ userId: auth.userId, name })
    .onConflictDoUpdate({
      target: businessSettings.userId,
      set: { name, updatedAt: new Date() },
    })

  return ok({ ok: true, name })
}))
