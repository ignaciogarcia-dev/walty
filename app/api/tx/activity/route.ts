import { NextRequest, NextResponse } from "next/server"
import { and, eq, desc, inArray } from "drizzle-orm"
import { db } from "@/server/db"
import { transactions, addresses } from "@/server/db/schema"
import { requireAuth } from "@/lib/auth"
import type { TransactionActivityItem } from "@/lib/activity/types"

export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req)

    // Get user's addresses
    const userAddresses = await db
      .select({ address: addresses.address })
      .from(addresses)
      .where(eq(addresses.userId, auth.userId))

    if (userAddresses.length === 0) {
      return NextResponse.json({ items: [], total: 0 })
    }

    const addressList = userAddresses.map((a) => a.address.toLowerCase())

    const { searchParams } = new URL(req.url)
    const typeParam = searchParams.get("type") || "all"
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100)
    const offset = Number(searchParams.get("offset") ?? 0)

    // Get all user transactions
    const allRows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, auth.userId))
      .orderBy(desc(transactions.createdAt))

    // Filter by type and address
    let filteredRows = allRows

    if (typeParam === "payments") {
      // Payments: fromAddress = user address, status = confirmed
      filteredRows = allRows.filter(
        (tx) =>
          addressList.includes(tx.fromAddress.toLowerCase()) &&
          tx.status === "confirmed"
      )
    } else if (typeParam === "sends") {
      // Sends: fromAddress = user address (all statuses)
      filteredRows = allRows.filter((tx) =>
        addressList.includes(tx.fromAddress.toLowerCase())
      )
    } else {
      // "all" - all transactions where user is the sender
      filteredRows = allRows.filter((tx) =>
        addressList.includes(tx.fromAddress.toLowerCase())
      )
    }

    // Apply pagination
    const paginatedRows = filteredRows.slice(offset, offset + limit)

    const items: TransactionActivityItem[] = paginatedRows.map((row) => {
      const isPayment = addressList.includes(row.fromAddress.toLowerCase()) && row.status === "confirmed"
      const isSend = addressList.includes(row.fromAddress.toLowerCase())

      return {
        id: row.id,
        type: isPayment ? "payment" : isSend ? "send" : "send",
        hash: row.hash,
        chainId: row.chainId,
        fromAddress: row.fromAddress,
        toAddress: row.toAddress,
        value: row.value,
        tokenSymbol: row.tokenSymbol,
        status: row.status as "pending" | "confirmed" | "failed",
        createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
      }
    })

    return NextResponse.json({ items, total: filteredRows.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected error"
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
