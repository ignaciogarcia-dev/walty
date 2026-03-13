import { NextRequest, NextResponse } from "next/server"
import { db } from "@/server/db"
import { paymentRequests, splitPaymentContributions } from "@/server/db/schema"
import { eq, asc } from "drizzle-orm"
import { toPaymentRequestView } from "@/lib/payments/paymentRequests"
import type { SplitPaymentContribution } from "@/lib/payments/types"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const request = await db.query.paymentRequests.findFirst({
    where: eq(paymentRequests.id, id),
  })

  if (!request) {
    return NextResponse.json({ error: "not found" }, { status: 404 })
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

  return NextResponse.json(view)
}
