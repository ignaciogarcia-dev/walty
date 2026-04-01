import { NextRequest } from "next/server"
import { eq, and } from "drizzle-orm"
import { db } from "@/server/db"
import { contacts } from "@/server/db/schema"
import { withErrorHandling, withAuth, ok, ValidationError } from "@/lib/api"

export const GET = withErrorHandling(withAuth(async (_req: NextRequest, { auth }) => {
  const rows = await db
    .select()
    .from(contacts)
    .where(eq(contacts.userId, auth.userId))
  return ok(rows)
}))

export const POST = withErrorHandling(withAuth(async (req: NextRequest, { auth }) => {
  const { name, address, chainId = 137 } = await req.json()

  if (!name || !address) throw new ValidationError("Missing fields")

  const [row] = await db
    .insert(contacts)
    .values({ userId: auth.userId, name, address, chainId })
    .returning()

  return ok(row)
}))

export const DELETE = withErrorHandling(withAuth(async (req: NextRequest, { auth }) => {
  const { id } = await req.json()

  if (!id) throw new ValidationError("Missing id")

  await db
    .delete(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.userId, auth.userId)))

  return ok({ ok: true })
}))
