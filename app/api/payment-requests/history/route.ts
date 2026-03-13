import { NextRequest, NextResponse } from "next/server"
import { and, desc, eq, inArray, or } from "drizzle-orm"
import { requireAuth } from "@/lib/auth"
import { toPaymentRequestView } from "@/lib/payments/paymentRequests"
import { db } from "@/server/db"
import { users, paymentRequests } from "@/server/db/schema"
import type { PaymentRequestHistoryItem } from "@/lib/activity/types"

async function requireBusinessUser(userId: number) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { userType: true },
  })

  if (user?.userType !== "business") {
    throw new Error("FORBIDDEN")
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req)
    await requireBusinessUser(auth.userId)

    const { searchParams } = new URL(req.url)
    const statusParam = searchParams.get("status") || "all"
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100)
    const offset = Number(searchParams.get("offset") ?? 0)

    // Build status filter
    let statusFilter: string[] | undefined
    if (statusParam === "paid") {
      statusFilter = ["paid"]
    } else if (statusParam === "expired") {
      statusFilter = ["expired"]
    } else if (statusParam === "pending") {
      statusFilter = ["pending"]
    } else if (statusParam === "confirming") {
      statusFilter = ["confirming"]
    } else {
      // "all" - include all statuses
      statusFilter = ["paid", "expired", "pending", "confirming"]
    }

    const rows = await db
      .select()
      .from(paymentRequests)
      .where(
        and(
          eq(paymentRequests.merchantId, auth.userId),
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
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "only business accounts can read payment requests" }, { status: 403 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
