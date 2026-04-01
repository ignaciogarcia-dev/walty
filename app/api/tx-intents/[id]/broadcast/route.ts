import { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/server/db"
import { txIntents } from "@/server/db/schema"
import { withErrorHandling, withAuth, ok, ValidationError, NotFoundError, ConflictError } from "@/lib/api"
import { rateLimitByIp } from "@/lib/rate-limit"
import { assertNotExpired } from "@/lib/tx-intents/expire"
import { broadcastSignedTx } from "@/lib/transactions/send"
import type { TxIntentPayload } from "@/lib/tx-intents/types"

type Ctx = { params: Promise<{ id: string }> }

export const POST = withErrorHandling<Ctx>(withAuth<Ctx>(async (
  _req: NextRequest,
  ctx: Ctx & { auth: { userId: number } }
) => {
  const { id } = await ctx.params
  const { auth } = ctx
  await rateLimitByIp(`tx-broadcast:${auth.userId}`, 5)

  // Atomically claim the intent by transitioning signed → broadcasting.
  // Only one concurrent request can win this update; the others will see
  // zero rows updated and receive an appropriate error, preventing duplicate broadcasts.
  const [claimed] = await db
    .update(txIntents)
    .set({ status: "broadcasting" })
    .where(and(
      eq(txIntents.id, id),
      eq(txIntents.userId, auth.userId),
      eq(txIntents.status, "signed")
    ))
    .returning()

  if (!claimed) {
    const [intent] = await db
      .select()
      .from(txIntents)
      .where(and(eq(txIntents.id, id), eq(txIntents.userId, auth.userId)))
      .limit(1)

    if (!intent) throw new NotFoundError("Intent not found")
    if (intent.status === "broadcasting" || intent.status === "broadcasted") {
      throw new ConflictError("Intent is already being broadcast")
    }
    throw new ValidationError(`Cannot broadcast intent in status "${intent.status}"`)
  }

  if (!claimed.signedRaw) {
    await db.update(txIntents).set({ status: "failed" }).where(and(eq(txIntents.id, id), eq(txIntents.status, "broadcasting")))
    throw new ValidationError("No signed transaction data")
  }

  await assertNotExpired(claimed)

  const payload = claimed.payload as TxIntentPayload
  let txHash: string
  try {
    txHash = await broadcastSignedTx(
      { raw: claimed.signedRaw as `0x${string}` },
      payload.chainId
    )
  } catch (err) {
    // Back to pending so the user can sign again with a fresh nonce (e.g. after RPC mismatch).
    await db
      .update(txIntents)
      .set({ status: "pending", signedRaw: null })
      .where(and(eq(txIntents.id, id), eq(txIntents.status, "broadcasting")))
    throw err
  }

  const [updated] = await db
    .update(txIntents)
    .set({ txHash, status: "broadcasted", signedRaw: null })
    .where(and(eq(txIntents.id, id), eq(txIntents.status, "broadcasting")))
    .returning()

  return ok(updated)
}))
