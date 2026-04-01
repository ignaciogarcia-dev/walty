import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/server/db"
import { txIntents } from "@/server/db/schema"
import { withErrorHandling, withAuth, ok, NotFoundError, ValidationError } from "@/lib/api"
import { rateLimitByIp } from "@/lib/rate-limit"
import { expireIfStale } from "@/lib/tx-intents/expire"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withErrorHandling<Ctx>(withAuth<Ctx>(async (
  _req: NextRequest,
  ctx: Ctx & { auth: { userId: number } }
) => {
  const { id } = await ctx.params
  const { auth } = ctx

  const [intent] = await db
    .select()
    .from(txIntents)
    .where(and(eq(txIntents.id, id), eq(txIntents.userId, auth.userId)))
    .limit(1)

  if (!intent) throw new NotFoundError("Intent not found")

  // Auto-expire
  if (intent.status === "pending" && await expireIfStale(intent)) {
    return ok({ ...intent, status: "expired" })
  }

  return ok(intent)
}))

export const PATCH = withErrorHandling<Ctx>(withAuth<Ctx>(async (
  req: NextRequest,
  ctx: Ctx & { auth: { userId: number } }
) => {
  const { id } = await ctx.params
  const { auth } = ctx
  await rateLimitByIp(`tx-confirm:${auth.userId}`, 10)

  const body = await req.json() as { status?: string }
  const status = body.status

  if (!status || !["confirmed", "failed"].includes(status)) {
    throw new ValidationError("Status must be 'confirmed' or 'failed'")
  }

  const finalStatus = status as "confirmed" | "failed"

  // Conditional update: only transition from "broadcasted" to avoid racing with sync
  const [updated] = await db
    .update(txIntents)
    .set({ status: finalStatus })
    .where(and(
      eq(txIntents.id, id),
      eq(txIntents.userId, auth.userId),
      eq(txIntents.status, "broadcasted")
    ))
    .returning()

  // If 0 rows, sync may have already confirmed — return current state
  if (!updated) {
    const [current] = await db
      .select()
      .from(txIntents)
      .where(and(eq(txIntents.id, id), eq(txIntents.userId, auth.userId)))
      .limit(1)

    if (!current) throw new NotFoundError("Intent not found")
    return ok(current)
  }

  return ok(updated)
}))
