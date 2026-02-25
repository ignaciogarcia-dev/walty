import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/server/db"
import { transactions } from "@/server/db/schema"
import { requireAuth } from "@/lib/auth"

// POST /api/tx — record a new transaction (status: pending)
export async function POST(req: NextRequest) {
  try {
    const { userId } = requireAuth(req)
    const { fromAddress, toAddress, amount, txHash, status } = await req.json()

    if (!fromAddress || !toAddress || !amount || !txHash) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }

    const validStatus = ["pending", "confirmed", "failed"] as const
    const resolvedStatus: (typeof validStatus)[number] = validStatus.includes(status)
      ? status
      : "pending"

    await db.insert(transactions).values({
      userId: String(userId),
      fromAddress,
      toAddress,
      amount,
      txHash,
      status: resolvedStatus,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

// GET /api/tx — list authenticated user's transactions (newest first)
export async function GET(req: NextRequest) {
  try {
    const { userId } = requireAuth(req)

    const rows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, String(userId)))
      .orderBy(transactions.createdAt)

    return NextResponse.json(rows)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

// PATCH /api/tx — update transaction status by txHash
export async function PATCH(req: NextRequest) {
  try {
    const { userId } = requireAuth(req)
    const { txHash, status } = await req.json()

    if (!txHash || !["confirmed", "failed"].includes(status)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    await db
      .update(transactions)
      .set({ status })
      .where(and(eq(transactions.txHash, txHash), eq(transactions.userId, String(userId))))

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
