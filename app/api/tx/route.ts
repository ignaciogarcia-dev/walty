import { NextRequest, NextResponse } from "next/server"
import { and, eq, desc } from "drizzle-orm"
import { db } from "@/server/db"
import { transactions } from "@/server/db/schema"
import { requireAuth } from "@/lib/auth"

// POST /api/tx — record a new transaction (always pending)
export async function POST(req: NextRequest) {
  try {
    const { userId } = requireAuth(req)
    const { fromAddress, toAddress, amount, txHash } = await req.json()

    if (!fromAddress || !toAddress || !amount || !txHash) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }

    await db.insert(transactions).values({
      userId,
      fromAddress,
      toAddress,
      amount,
      txHash,
      status: "pending",
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

// GET /api/tx — list authenticated user's transactions (newest first, paginated)
export async function GET(req: NextRequest) {
  try {
    const { userId } = requireAuth(req)

    const { searchParams } = new URL(req.url)
    const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100)
    const offset = Number(searchParams.get("offset") ?? 0)

    const rows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt))
      .limit(limit)
      .offset(offset)

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
      .where(and(eq(transactions.txHash, txHash), eq(transactions.userId, userId)))

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
