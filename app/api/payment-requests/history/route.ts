import { NextRequest, NextResponse } from "next/server"
import { and, desc, inArray, eq } from "drizzle-orm"
import { requireAuth } from "@/lib/auth"
import { db } from "@/server/db"
import { paymentRequests } from "@/server/db/schema"
import { getBusinessContext } from "@/lib/business/getBusinessContext"
import type { PaymentRequestHistoryItem } from "@/lib/activity/types"

export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req)
    const ctx = await getBusinessContext(auth.userId)
    if (!ctx) {
      return NextResponse.json({ error: "only business accounts can read payment requests" }, { status: 403 })
    }

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

    const rows = await db
      .select()
      .from(paymentRequests)
      .where(
        and(
          eq(paymentRequests.merchantId, ctx.businessId),
          inArray(paymentRequests.status, statusFilter)
        )
      )
      .orderBy(desc(paymentRequests.createdAt))
      .limit(limit)
      .offset(offset)

    const items: PaymentRequestHistoryItem[] = rows.map((row) => ({
      id: row.id,
      status: row.status as "pending" | "confirming" | "paid" | "expired",
      amountUsd: row.amountUsd,
      tokenSymbol: row.tokenSymbol,
      createdAt: row.createdAt.toISOString(),
      paidAt: row.paidAt?.toISOString() ?? null,
      txHash: row.txHash,
      chainId: row.chainId,
    }))

    return NextResponse.json({ items, total: items.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected error"
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
