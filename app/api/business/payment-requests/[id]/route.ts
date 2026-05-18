import { NextRequest } from "next/server"
import { db } from "@/server/db"
import { paymentRequests, splitPaymentContributions } from "@/server/db/schema"
import { and, eq, asc } from "drizzle-orm"
import { toPaymentRequestView } from "@/lib/payments/paymentRequests"
import type { SplitPaymentContribution } from "@/lib/payments/types"
import { ok, NotFoundError, withBusinessAuth } from "@/lib/api"
import { Permission } from "@/lib/permissions"
import { reconcilePendingPaymentRequests } from "@/lib/payments/reconcilePendingPaymentRequests"

type RouteCtx = { params: Promise<{ id: string }> }

export const GET = withBusinessAuth<RouteCtx>(Permission.PAYMENT_REQUEST_READ, async (_req, { business, params }) => {
  const { id } = await params

  await reconcilePendingPaymentRequests({ id }).catch((err) => {
    console.error("[business/payment-requests/[id]] reconcile error:", err)
  })

  const request = await db.query.paymentRequests.findFirst({
    where: and(eq(paymentRequests.id, id), eq(paymentRequests.merchantId, business.businessId)),
  })

  if (!request) throw new NotFoundError("not found")

  const view = toPaymentRequestView(request)

  if (view.isSplitPayment) {
    const contributions = await db
      .select()
      .from(splitPaymentContributions)
      .where(eq(splitPaymentContributions.paymentRequestId, id))
      .orderBy(asc(splitPaymentContributions.createdAt))

    view.contributions = contributions.map((c) => ({
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
  }

  return ok(view)
})
