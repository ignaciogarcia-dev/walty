import { NextRequest } from "next/server"
import { env } from "@/lib/env"
import { PAYMENT_RECONCILE_HEADER } from "@/lib/payments/config"
import { reconcilePendingPaymentRequests } from "@/lib/payments/reconcilePendingPaymentRequests"
import { reconcileIncomingTransfers } from "@/lib/tx/reconcileIncomingTransfers"
import { cleanupExpiredEntries } from "@/lib/rate-limit"
import { withErrorHandling, ok, AuthError } from "@/lib/api"

export const POST = withErrorHandling(async (req: NextRequest) => {
  const providedSecret = req.headers.get(PAYMENT_RECONCILE_HEADER)

  if (providedSecret !== env.PAYMENTS_RECONCILE_SECRET) {
    throw new AuthError()
  }

  const [result, incomingResult] = await Promise.all([
    reconcilePendingPaymentRequests(),
    reconcileIncomingTransfers(),
    cleanupExpiredEntries(),
  ])
  return ok({ ok: true, ...result, incoming: incomingResult })
})
