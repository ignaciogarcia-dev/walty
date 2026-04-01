import { NextRequest } from "next/server"
import { db } from "@/server/db"
import { paymentRequests, splitPaymentContributions } from "@/server/db/schema"
import { eq, asc } from "drizzle-orm"
import type { SplitPaymentContribution } from "@/lib/payments/types"
import { withErrorHandling, ok, NotFoundError, getIp } from "@/lib/api"
import { rateLimitByIp } from "@/lib/rate-limit"

type RouteCtx = { params: Promise<{ id: string }> }

export const GET = withErrorHandling(async (
  req: NextRequest,
  { params }: RouteCtx
) => {
  await rateLimitByIp(`contributions-poll:${getIp(req)}`, 30, 60_000)

  const { id } = await params

  const request = await db.query.paymentRequests.findFirst({
    where: eq(paymentRequests.id, id),
  })

  if (!request) {
    throw new NotFoundError("not found")
  }

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

  return ok({ contributions: contributionViews })
})
