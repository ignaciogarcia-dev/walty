import { Router } from "express"
import { AuthError } from "@walty/shared/api-utils/errors"
import { PAYMENT_RECONCILE_HEADER } from "@walty/shared/payments/config"
import { reconcilePendingPaymentRequests } from "@walty/shared/payments/reconcilePendingPaymentRequests"
import { cleanupExpiredEntries } from "@walty/shared/rate-limit"
import { reconcileIncomingTransfers } from "@walty/shared/tx/reconcileIncomingTransfers"
import { asyncHandler } from "../middleware/asyncHandler.js"
import { runSweep } from "../workers/sweep.js"

export const internalRouter: Router = Router()

function assertSecret(req: { header(name: string): string | undefined }): void {
  const expected = process.env.PAYMENTS_RECONCILE_SECRET
  const got = req.header(PAYMENT_RECONCILE_HEADER)
  if (!expected || got !== expected) throw new AuthError()
}

internalRouter.post(
  "/internal/payment-requests/reconcile",
  asyncHandler(async (req, res) => {
    assertSecret(req)
    const [result, incomingResult] = await Promise.all([
      reconcilePendingPaymentRequests(),
      reconcileIncomingTransfers(),
      cleanupExpiredEntries(),
    ])
    res.json({ ok: true, ...result, incoming: incomingResult })
  }),
)

internalRouter.post(
  "/internal/tx/scan-incoming",
  asyncHandler(async (req, res) => {
    assertSecret(req)
    const result = await reconcileIncomingTransfers()
    res.json({ ok: true, ...result })
  }),
)

internalRouter.post(
  "/internal/tx-intents/sweep",
  asyncHandler(async (req, res) => {
    const expected = process.env.INTERNAL_RECONCILE_SECRET
    const got = req.header("x-internal-secret")
    if (!expected || got !== expected) throw new AuthError()
    const reset = await runSweep()
    res.json({ reset })
  }),
)
