import { NextRequest } from "next/server"
import { db } from "@/server/db"
import { paymentRequests, splitPaymentContributions } from "@/server/db/schema"
import { eq, asc } from "drizzle-orm"
import { toPaymentRequestView } from "@/lib/payments/paymentRequests"
import type { SplitPaymentContribution } from "@/lib/payments/types"
import { withErrorHandling, ok, NotFoundError } from "@/lib/api"
import { reconcilePendingPaymentRequests } from "@/lib/payments/reconcilePendingPaymentRequests"
import { rateLimitByIp } from "@/lib/rate-limit"
import { getIp } from "@/lib/api"

type RouteCtx = { params: Promise<{ id: string }> }

export const GET = withErrorHandling(async (
  req: NextRequest,
  { params }: RouteCtx
) => {
  await rateLimitByIp(`payment-request-poll:${getIp(req)}`, 60, 60_000)

  const { id } = await params

  // Reconcile this specific request before reading the DB so each poll
  // also scans the blockchain for incoming transfers.
  await reconcilePendingPaymentRequests({ id }).catch((err) => {
    console.error("[payment-requests/[id]] reconcile error:", err)
  })

  const request = await db.query.paymentRequests.findFirst({
    where: eq(paymentRequests.id, id),
  })

  if (!request) {
    throw new NotFoundError("not found")
  }

  const view = toPaymentRequestView(request)

  // If it's a split payment, fetch contributions
  if (view.isSplitPayment) {
    const contributions = await db
      .select()
      .from(splitPaymentContributions)
      .where(eq(splitPaymentContributions.paymentRequestId, id))
      .orderBy(asc(splitPaymentContributions.createdAt))

    const contributionViews: SplitPaymentContribution[] = contributions.map((c) => ({
      id: c.id,
      paymentRequestId: c.paymentRequestId,
      txHash: c.txHash,
      payerAddress: c.payerAddress,
      amountToken: c.amountToken,
      amountUsd: c.amountUsd,
      tokenSymbol: c.tokenSymbol,
      confirmations: c.confirmations,
      status: c.status as SplitPaymentContribution["status"],
      blockNumber: c.blockNumber ?? null,
      detectedAt: c.detectedAt?.toISOString() ?? null,
      confirmedAt: c.confirmedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    }))

    view.contributions = contributionViews
  }

  return ok(view)
})
