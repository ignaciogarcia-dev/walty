import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/server/db"
import { transactions } from "@/server/db/schema"
import { requireAuth } from "@/lib/auth"
import { client as publicClient } from "@/lib/eth"

// POST /api/tx/sync — check on-chain status for all non-confirmed transactions
export async function POST(req: NextRequest) {
  try {
    const { userId } = requireAuth(req)

    const txs = await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, String(userId)))

    for (const tx of txs) {
      if (tx.status === "confirmed") continue

      const receipt = await publicClient
        .getTransactionReceipt({ hash: tx.txHash as `0x${string}` })
        .catch(() => null)

      if (receipt) {
        await db
          .update(transactions)
          .set({ status: receipt.status === "success" ? "confirmed" : "failed" })
          .where(eq(transactions.id, tx.id))
      }
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
