import { NextRequest, NextResponse } from "next/server"
import { and, eq, gte, lte, inArray } from "drizzle-orm"
import { requireAuth } from "@/lib/auth"
import { db } from "@/server/db"
import { users, transactions, addresses, paymentRequests } from "@/server/db/schema"
import type { PersonActivityStats, BusinessActivityStats, ActivityStats } from "@/lib/activity/types"
import { sumAmounts } from "@/lib/activity/utils"

function getMonthRange(monthOffset: number = 0): { start: Date; end: Date } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() - monthOffset

  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999)

  return { start, end }
}

export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req)

    // Get user to determine type
    const user = await db.query.users.findFirst({
      where: eq(users.id, auth.userId),
      columns: { userType: true },
    })

    if (!user) {
      return NextResponse.json({ error: "user not found" }, { status: 404 })
    }

    const currentMonth = getMonthRange(0)
    const previousMonth = getMonthRange(1)

    if (user.userType === "person") {
      // Get user addresses
      const userAddresses = await db
        .select({ address: addresses.address })
        .from(addresses)
        .where(eq(addresses.userId, auth.userId))

      if (userAddresses.length === 0) {
        const stats: PersonActivityStats = {
          currentMonthExpenses: { total: "0", count: 0 },
          previousMonthExpenses: { total: "0", count: 0 },
          currentMonthSends: { total: "0", count: 0 },
          previousMonthSends: { total: "0", count: 0 },
          expensesChangePercent: 0,
          sendsChangePercent: 0,
        }
        return NextResponse.json({ person: stats })
      }

      const addressList = userAddresses.map((a) => a.address.toLowerCase())

      // Get current month transactions (payments: confirmed, sends: all)
      const currentMonthTxs = await db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, auth.userId),
            gte(transactions.createdAt, currentMonth.start),
            lte(transactions.createdAt, currentMonth.end)
          )
        )

      // Get previous month transactions
      const previousMonthTxs = await db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, auth.userId),
            gte(transactions.createdAt, previousMonth.start),
            lte(transactions.createdAt, previousMonth.end)
          )
        )

      // Filter payments (confirmed transactions from user)
      const currentPayments = currentMonthTxs.filter(
        (tx) =>
          addressList.includes(tx.fromAddress.toLowerCase()) &&
          tx.status === "confirmed"
      )
      const previousPayments = previousMonthTxs.filter(
        (tx) =>
          addressList.includes(tx.fromAddress.toLowerCase()) &&
          tx.status === "confirmed"
      )

      // Filter sends (all transactions from user)
      const currentSends = currentMonthTxs.filter((tx) =>
        addressList.includes(tx.fromAddress.toLowerCase())
      )
      const previousSends = previousMonthTxs.filter((tx) =>
        addressList.includes(tx.fromAddress.toLowerCase())
      )

      // Calculate totals
      const currentExpensesTotal = sumAmounts(
        currentPayments.map((tx) => tx.value)
      )
      const previousExpensesTotal = sumAmounts(
        previousPayments.map((tx) => tx.value)
      )

      const currentSendsTotal = sumAmounts(currentSends.map((tx) => tx.value))
      const previousSendsTotal = sumAmounts(previousSends.map((tx) => tx.value))

      const expensesChangePercent =
        parseFloat(previousExpensesTotal) === 0
          ? (parseFloat(currentExpensesTotal) > 0 ? 100 : 0)
          : ((parseFloat(currentExpensesTotal) - parseFloat(previousExpensesTotal)) /
              parseFloat(previousExpensesTotal)) *
            100

      const sendsChangePercent =
        parseFloat(previousSendsTotal) === 0
          ? (parseFloat(currentSendsTotal) > 0 ? 100 : 0)
          : ((parseFloat(currentSendsTotal) - parseFloat(previousSendsTotal)) /
              parseFloat(previousSendsTotal)) *
            100

      const stats: PersonActivityStats = {
        currentMonthExpenses: {
          total: currentExpensesTotal,
          count: currentPayments.length,
        },
        previousMonthExpenses: {
          total: previousExpensesTotal,
          count: previousPayments.length,
        },
        currentMonthSends: {
          total: currentSendsTotal,
          count: currentSends.length,
        },
        previousMonthSends: {
          total: previousSendsTotal,
          count: previousSends.length,
        },
        expensesChangePercent,
        sendsChangePercent,
      }

      return NextResponse.json({ person: stats })
    } else {
      // Business user
      // Get all payment requests for the merchant
      const allRequests = await db
        .select()
        .from(paymentRequests)
        .where(eq(paymentRequests.merchantId, auth.userId))

      // Filter by month using paidAt for paid requests, createdAt for others
      const currentMonthRequests = allRequests.filter((r) => {
        const dateToCheck = r.status === "paid" && r.paidAt ? r.paidAt : r.createdAt
        return dateToCheck >= currentMonth.start && dateToCheck <= currentMonth.end
      })

      const previousMonthRequests = allRequests.filter((r) => {
        const dateToCheck = r.status === "paid" && r.paidAt ? r.paidAt : r.createdAt
        return dateToCheck >= previousMonth.start && dateToCheck <= previousMonth.end
      })

      // Filter by status
      const currentPaid = currentMonthRequests.filter((r) => r.status === "paid")
      const currentFailed = currentMonthRequests.filter(
        (r) => r.status === "expired"
      )
      const previousPaid = previousMonthRequests.filter((r) => r.status === "paid")

      // Calculate totals
      const currentSalesTotal = sumAmounts(currentPaid.map((r) => r.amountUsd))
      const previousSalesTotal = sumAmounts(previousPaid.map((r) => r.amountUsd))

      const totalRequests = currentPaid.length + currentFailed.length
      const successRate =
        totalRequests > 0 ? (currentPaid.length / totalRequests) * 100 : 0

      const salesChangePercent =
        parseFloat(previousSalesTotal) === 0
          ? (parseFloat(currentSalesTotal) > 0 ? 100 : 0)
          : ((parseFloat(currentSalesTotal) - parseFloat(previousSalesTotal)) /
              parseFloat(previousSalesTotal)) *
            100

      const stats: BusinessActivityStats = {
        currentMonthSales: {
          total: currentSalesTotal,
          count: currentPaid.length,
        },
        previousMonthSales: {
          total: previousSalesTotal,
          count: previousPaid.length,
        },
        currentMonthCompleted: currentPaid.length,
        currentMonthFailed: currentFailed.length,
        successRate,
        salesChangePercent,
      }

      return NextResponse.json({ business: stats })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected error"
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
