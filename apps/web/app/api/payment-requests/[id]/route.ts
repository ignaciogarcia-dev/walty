import { NextRequest } from "next/server"
import { db } from "@walty/db"
import { paymentRequests, splitPaymentContributions } from "@walty/db"
import { eq, and } from "drizzle-orm"
import { toPublicPaymentRequestView } from "@walty/shared/payments/paymentRequests"
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

  await reconcilePendingPaymentRequests({ id }).catch((err) => {
    console.error("[payment-requests/[id]] reconcile error:", err)
  })

  const request = await db.query.paymentRequests.findFirst({
    where: eq(paymentRequests.id, id),
  })

  if (!request) {
    throw new NotFoundError("not found")
  }

  const view = toPublicPaymentRequestView(request)

  // For split payments expose summary counters only — never per-contribution detail.
  let contributionsSummary: { count: number; confirmedCount: number } | undefined
  if (view.isSplitPayment) {
    const allCount = await db
      .select({ id: splitPaymentContributions.id, status: splitPaymentContributions.status })
      .from(splitPaymentContributions)
      .where(eq(splitPaymentContributions.paymentRequestId, id))
    const confirmedCount = await db
      .select({ id: splitPaymentContributions.id })
      .from(splitPaymentContributions)
      .where(and(
        eq(splitPaymentContributions.paymentRequestId, id),
        eq(splitPaymentContributions.status, "confirmed"),
      ))
    contributionsSummary = {
      count: allCount.length,
      confirmedCount: confirmedCount.length,
    }
  }

  return ok({ ...view, contributionsSummary })
})
