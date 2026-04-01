import { NextRequest } from "next/server"
import { and, desc, inArray, eq } from "drizzle-orm"
import { db } from "@/server/db"
import { paymentRequests } from "@/server/db/schema"
import type { PaymentRequestHistoryItem } from "@/lib/activity/types"
import { withBusinessAuth, ok } from "@/lib/api"
import { Permission } from "@/lib/permissions"

export const GET = withBusinessAuth(Permission.PAYMENT_HISTORY_READ, async (req: NextRequest, { business, auth }) => {
  const { searchParams } = new URL(req.url)
  const statusParam = searchParams.get("status") || "all"
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100)
  const offset = Number(searchParams.get("offset") ?? 0)

  let statusFilter: string[]
  if (statusParam === "paid") {
    statusFilter = ["paid"]
  } else if (statusParam === "expired") {
    statusFilter = ["expired"]
  } else if (statusParam === "pending") {
    statusFilter = ["pending"]
  } else if (statusParam === "confirming") {
    statusFilter = ["confirming"]
  } else {
    statusFilter = ["paid", "expired", "pending", "confirming"]
  }

  const whereParts = [
    eq(paymentRequests.merchantId, business.businessId),
    inArray(paymentRequests.status, statusFilter),
  ]
  // Cashiers only see payment requests they created (not the owner's wallet collections).
  if (!business.isOwner) {
    whereParts.push(eq(paymentRequests.operatorId, auth.userId))
  }

  const rows = await db
    .select()
    .from(paymentRequests)
    .where(and(...whereParts))
    .orderBy(desc(paymentRequests.createdAt))
    .limit(limit)
    .offset(offset)

  const items: PaymentRequestHistoryItem[] = rows.map((row) => {
    let receivedAmountUsd: string | null = null
    if (row.status === "paid" && row.receivedAmountToken && row.amountToken) {
      const amountTokenBig = BigInt(row.amountToken)
      if (amountTokenBig > 0n) {
        const received = (parseFloat(row.amountUsd) * Number(BigInt(row.receivedAmountToken))) / Number(amountTokenBig)
        receivedAmountUsd = received.toFixed(2)
      }
    }
    return {
      id: row.id,
      status: row.status as "pending" | "confirming" | "paid" | "expired",
      amountUsd: row.amountUsd,
      receivedAmountUsd,
      tokenSymbol: row.tokenSymbol,
      createdAt: row.createdAt.toISOString(),
      paidAt: row.paidAt?.toISOString() ?? null,
      txHash: row.txHash,
      chainId: row.chainId,
      payerAddress: row.payerAddress,
    }
  })

  return ok({ items, total: items.length })
})
