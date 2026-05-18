import { NextRequest } from "next/server"
import { db } from "@/server/db"
import { paymentRequests, splitPaymentContributions } from "@/server/db/schema"
import { and, eq } from "drizzle-orm"
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
    columns: { id: true, totalPaidUsd: true, amountUsd: true, status: true },
  })

  if (!request) {
    throw new NotFoundError("not found")
  }

  const all = await db
    .select({ id: splitPaymentContributions.id, status: splitPaymentContributions.status })
    .from(splitPaymentContributions)
    .where(eq(splitPaymentContributions.paymentRequestId, id))

  const confirmed = await db
    .select({ id: splitPaymentContributions.id })
    .from(splitPaymentContributions)
    .where(and(
      eq(splitPaymentContributions.paymentRequestId, id),
      eq(splitPaymentContributions.status, "confirmed"),
    ))

  const amountUsd = parseFloat(request.amountUsd)
  const paidUsd = parseFloat(request.totalPaidUsd ?? "0")

  return ok({
    count: all.length,
    confirmedCount: confirmed.length,
    totalPaidUsd: request.totalPaidUsd ?? "0",
    fullyPaid: paidUsd >= amountUsd,
    status: request.status,
  })
})
