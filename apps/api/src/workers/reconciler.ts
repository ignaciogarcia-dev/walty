import { reconcilePendingPaymentRequests } from "@walty/shared/payments/reconcilePendingPaymentRequests"
import { cleanupExpiredEntries } from "@walty/shared/rate-limit"
import { reconcileIncomingTransfers } from "@walty/shared/tx/reconcileIncomingTransfers"
import { logger } from "../config/logger.js"

export async function runReconciler(): Promise<void> {
  try {
    const [pending, incoming] = await Promise.all([
      reconcilePendingPaymentRequests(),
      reconcileIncomingTransfers(),
      cleanupExpiredEntries(),
    ])
    logger.info(
      { pending, incoming },
      "reconciler tick",
    )
  } catch (err) {
    logger.error({ err }, "reconciler failed")
  }
}
