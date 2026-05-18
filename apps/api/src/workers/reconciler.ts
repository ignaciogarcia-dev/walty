import { reconcilePendingPaymentRequests } from "@walty/shared/payments/reconcilePendingPaymentRequests"
import { cleanupExpiredEntries } from "@walty/shared/rate-limit"
import { reconcileIncomingTransfers } from "@walty/shared/tx/reconcileIncomingTransfers"
import { logger } from "../config/logger.js"
import { emitPaymentRequestEvent } from "../ws/io.js"

export async function runReconciler(): Promise<void> {
  try {
    const [pending, incoming] = await Promise.all([
      reconcilePendingPaymentRequests({ onEvent: emitPaymentRequestEvent }),
      reconcileIncomingTransfers(),
    ])
    await cleanupExpiredEntries()
    logger.info({ pending, incoming }, "reconciler tick")
  } catch (err) {
    logger.error({ err }, "reconciler failed")
  }
}
