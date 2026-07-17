import { lt } from "drizzle-orm"
import { db, posRequestNonces } from "@walty/db"
import { reconcilePendingPaymentRequests } from "@walty/shared/payments/reconcilePendingPaymentRequests"
import { cleanupExpiredEntries } from "@walty/shared/rate-limit"
import { reconcileIncomingTransfers } from "@walty/shared/tx/reconcileIncomingTransfers"
import { logger } from "../config/logger.js"
import { expireStalePairings } from "../services/deviceSessions.js"
import { reconcilerSink } from "../ws/reconcilerSink.js"

export async function runReconciler(): Promise<void> {
  try {
    const [pending, incoming, expiredPairings] = await Promise.all([
      reconcilePendingPaymentRequests({ onEvent: reconcilerSink }),
      reconcileIncomingTransfers(),
      expireStalePairings(),
    ])
    await cleanupExpiredEntries()
    // Prune expired POS anti-replay nonces (insert-only otherwise)
    await db
      .delete(posRequestNonces)
      .where(lt(posRequestNonces.expiresAt, new Date()))
    logger.info({ pending, incoming, expiredPairings }, "reconciler tick")
  } catch (err) {
    logger.error({ err }, "reconciler failed")
  }
}
