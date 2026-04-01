import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/server/db"
import { txIntents } from "@/server/db/schema"
import { withErrorHandling, withAuth, ok, ValidationError, NotFoundError } from "@/lib/api"
import { rateLimitByIp } from "@/lib/rate-limit"

type Ctx = { params: Promise<{ id: string }> }

export const POST = withErrorHandling<Ctx>(withAuth<Ctx>(async (
  _req: NextRequest,
  ctx: Ctx & { auth: { userId: number } }
) => {
  const { id } = await ctx.params
  const { auth } = ctx
  await rateLimitByIp(`tx-retry:${auth.userId}`, 5)

  const [intent] = await db
    .select()
    .from(txIntents)
    .where(and(eq(txIntents.id, id), eq(txIntents.userId, auth.userId)))
    .limit(1)

  if (!intent) throw new NotFoundError("Intent not found")

  if (intent.status !== "failed") {
    throw new ValidationError(`Cannot reset intent in status "${intent.status}"`)
  }

  const [updated] = await db
    .update(txIntents)
    .set({ status: "pending", signedRaw: null })
    .where(and(eq(txIntents.id, id), eq(txIntents.status, "failed")))
    .returning()

  if (!updated) throw new ValidationError("Intent already updated")

  return ok(updated)
}))
