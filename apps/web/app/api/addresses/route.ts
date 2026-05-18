import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@walty/db"
import { addresses } from "@walty/db"
import { withErrorHandling, withAuth, ok } from "@/lib/api"

export const GET = withErrorHandling(withAuth(async (_req: NextRequest, { auth }) => {
  const result = await db
    .select()
    .from(addresses)
    .where(eq(addresses.userId, auth.userId))
  return ok({ addresses: result })
}))
