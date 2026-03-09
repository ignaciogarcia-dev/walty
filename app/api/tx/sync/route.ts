import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/server/db"
import { transactions } from "@/server/db/schema"
import { requireAuth } from "@/lib/auth"
import { getPublicClient } from "@/lib/rpc/getPublicClient"

// POST /api/tx/sync — check on-chain status for all non-confirmed transactions
export async function POST(req: NextRequest) {
  try {
    const { userId } = requireAuth(req)

    const txs = await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))

    for (const tx of txs) {
      if (tx.status === "confirmed") continue

      const publicClient = getPublicClient(tx.chainId)

      const receipt = await publicClient
        .getTransactionReceipt({ hash: tx.hash as `0x${string}` })
        .catch(() => null)

      if (receipt) {
        await db
          .update(transactions)
          .set({
            status: receipt.status === "success" ? "confirmed" : "failed",
            gasUsed: receipt.gasUsed?.toString() ?? null,
            blockNumber: receipt.blockNumber?.toString() ?? null,
          })
          .where(eq(transactions.id, tx.id))
      }
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
