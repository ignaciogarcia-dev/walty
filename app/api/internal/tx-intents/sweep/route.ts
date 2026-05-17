import { NextRequest } from "next/server"
import { and, eq, lt } from "drizzle-orm"
import { db } from "@/server/db"
import { txIntents } from "@/server/db/schema"
import { withErrorHandling, ok, ForbiddenError } from "@/lib/api"

const STUCK_BROADCASTING_MS = 60_000

/**
 * Recovers tx-intents stuck in "broadcasting" longer than STUCK_BROADCASTING_MS.
 * If a broadcast handler crashes between the atomic claim and the revert, the
 * intent would otherwise be unsignable forever. This endpoint resets such rows
 * to "pending" so the user can sign and retry.
 *
 * Guarded by INTERNAL_RECONCILE_SECRET header — call from a cron or alongside
 * the payment reconciler.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const expected = process.env.INTERNAL_RECONCILE_SECRET
  const got = req.headers.get("x-internal-secret")
  if (!expected || got !== expected) {
    throw new ForbiddenError("invalid secret")
  }

  const cutoff = new Date(Date.now() - STUCK_BROADCASTING_MS)

  const reset = await db
    .update(txIntents)
    .set({ status: "pending", signedRaw: null, updatedAt: new Date() })
    .where(and(eq(txIntents.status, "broadcasting"), lt(txIntents.updatedAt, cutoff)))
    .returning({ id: txIntents.id })

  return ok({ reset: reset.length })
})
