import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/server/db"
import { addresses } from "@/server/db/schema"
import { withErrorHandling, withAuth, ok } from "@/lib/api"

export const GET = withErrorHandling(withAuth(async (_req: NextRequest, { auth }) => {
  const result = await db
    .select()
    .from(addresses)
    .where(eq(addresses.userId, auth.userId))
  return ok({ addresses: result })
}))
