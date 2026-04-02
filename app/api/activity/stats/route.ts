import { NextRequest } from "next/server"
import { and, eq, gte, lte } from "drizzle-orm"
import { db } from "@/server/db"
import { users, transactions, addresses, paymentRequests } from "@/server/db/schema"
import type { PersonActivityStats, BusinessActivityStats } from "@/lib/activity/types"
import { sumAmounts } from "@/lib/activity/utils"
import { withErrorHandling, withAuth, ok, NotFoundError } from "@/lib/api"
import { rateLimitByUser } from "@/lib/rate-limit"

function getMonthRange(monthOffset: number = 0): { start: Date; end: Date } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() - monthOffset

  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999)

  return { start, end }
}

export const GET = withErrorHandling(withAuth(async (_req: NextRequest, { auth }) => {
  await rateLimitByUser(auth.userId, 10, 60_000)

  const user = await db.query.users.findFirst({
    where: eq(users.id, auth.userId),
    columns: { userType: true },
  })

  if (!user) throw new NotFoundError("user not found")

  const currentMonth = getMonthRange(0)
  const previousMonth = getMonthRange(1)

  if (user.userType === "person") {
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
      return ok({ person: stats })
    }

    const addressList = userAddresses.map((a) => a.address.toLowerCase())

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

    const currentSends = currentMonthTxs.filter((tx) =>
      addressList.includes(tx.fromAddress.toLowerCase())
    )
    const previousSends = previousMonthTxs.filter((tx) =>
      addressList.includes(tx.fromAddress.toLowerCase())
    )

    const currentExpensesTotal = sumAmounts(currentPayments.map((tx) => tx.value))
    const previousExpensesTotal = sumAmounts(previousPayments.map((tx) => tx.value))
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
      currentMonthExpenses: { total: currentExpensesTotal, count: currentPayments.length },
      previousMonthExpenses: { total: previousExpensesTotal, count: previousPayments.length },
      currentMonthSends: { total: currentSendsTotal, count: currentSends.length },
      previousMonthSends: { total: previousSendsTotal, count: previousSends.length },
      expensesChangePercent,
      sendsChangePercent,
    }

    return ok({ person: stats })
  }

  // Business user — use auth.userId directly as merchantId (owner)
  const allRequests = await db
    .select()
    .from(paymentRequests)
    .where(eq(paymentRequests.merchantId, auth.userId))

  const currentMonthRequests = allRequests.filter((r) => {
    const dateToCheck = r.status === "paid" && r.paidAt ? r.paidAt : r.createdAt
    return dateToCheck >= currentMonth.start && dateToCheck <= currentMonth.end
  })

  const previousMonthRequests = allRequests.filter((r) => {
    const dateToCheck = r.status === "paid" && r.paidAt ? r.paidAt : r.createdAt
    return dateToCheck >= previousMonth.start && dateToCheck <= previousMonth.end
  })

  const currentPaid = currentMonthRequests.filter((r) => r.status === "paid")
  const currentFailed = currentMonthRequests.filter((r) => r.status === "expired")
  const previousPaid = previousMonthRequests.filter((r) => r.status === "paid")

  const currentSalesTotal = sumAmounts(currentPaid.map((r) => r.receivedAmountUsd ?? r.amountUsd))
  const previousSalesTotal = sumAmounts(previousPaid.map((r) => r.receivedAmountUsd ?? r.amountUsd))

  const totalRequests = currentPaid.length + currentFailed.length
  const successRate = totalRequests > 0 ? (currentPaid.length / totalRequests) * 100 : 0

  const salesChangePercent =
    parseFloat(previousSalesTotal) === 0
      ? (parseFloat(currentSalesTotal) > 0 ? 100 : 0)
      : ((parseFloat(currentSalesTotal) - parseFloat(previousSalesTotal)) /
          parseFloat(previousSalesTotal)) *
        100

  const stats: BusinessActivityStats = {
    currentMonthSales: { total: currentSalesTotal, count: currentPaid.length },
    previousMonthSales: { total: previousSalesTotal, count: previousPaid.length },
    currentMonthCompleted: currentPaid.length,
    currentMonthFailed: currentFailed.length,
    successRate,
    salesChangePercent,
  }

  return ok({ business: stats })
}))
