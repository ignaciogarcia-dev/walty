import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/server/db"
import { txIntents } from "@/server/db/schema"
import { withErrorHandling, withAuth, ok, ValidationError, NotFoundError } from "@/lib/api"
import { rateLimitByIp } from "@/lib/rate-limit"
import { assertNotExpired } from "@/lib/tx-intents/expire"

type Ctx = { params: Promise<{ id: string }> }

export const POST = withErrorHandling<Ctx>(withAuth<Ctx>(async (
  req: NextRequest,
  ctx: Ctx & { auth: { userId: number } }
) => {
  const { id } = await ctx.params
  const { auth } = ctx
  await rateLimitByIp(`tx-sign:${auth.userId}`, 10)

  const { signedRaw } = await req.json() as { signedRaw?: string }

  if (
    !signedRaw ||
    !/^0x([0-9a-fA-F]{2})+$/.test(signedRaw)
  ) {
    throw new ValidationError("Invalid signed transaction")
  }

  const [intent] = await db
    .select()
    .from(txIntents)
    .where(and(eq(txIntents.id, id), eq(txIntents.userId, auth.userId)))
    .limit(1)

  if (!intent) throw new NotFoundError("Intent not found")

  if (intent.status !== "pending") {
    throw new ValidationError(`Cannot sign intent in status "${intent.status}"`)
  }

  await assertNotExpired(intent)

  const [updated] = await db
    .update(txIntents)
    .set({ signedRaw, status: "signed" })
    .where(and(eq(txIntents.id, id), eq(txIntents.status, "pending")))
    .returning()

  if (!updated) throw new ValidationError("Intent already signed or expired")

  return ok(updated)
}))
