import { and, eq, lt } from "drizzle-orm"
import { db, txIntents } from "@walty/db"
import { logger } from "../config/logger.js"

const STUCK_BROADCASTING_MS = 60_000

/**
 * Recovers tx-intents stuck in "broadcasting" longer than STUCK_BROADCASTING_MS.
 * If a broadcast handler crashes between the atomic claim and the revert, the
 * intent would otherwise be unsignable forever — reset to "pending" so the
 * user can sign and retry.
 */
export async function runSweep(): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - STUCK_BROADCASTING_MS)
    const reset = await db
      .update(txIntents)
      .set({ status: "pending", signedRaw: null, updatedAt: new Date() })
      .where(
        and(
          eq(txIntents.status, "broadcasting"),
          lt(txIntents.updatedAt, cutoff),
        ),
      )
      .returning({ id: txIntents.id })

    if (reset.length > 0) {
      logger.info({ count: reset.length }, "sweep reset stuck broadcasting intents")
    }
    return reset.length
  } catch (err) {
    logger.error({ err }, "sweep failed")
    return 0
  }
}
