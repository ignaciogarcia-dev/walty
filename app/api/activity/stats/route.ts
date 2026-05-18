import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/server/db"
import { paymentRequests } from "@/server/db/schema"
import type { BusinessActivityStats } from "@/lib/activity/types"
import { sumAmounts } from "@/lib/activity/utils"
import { withErrorHandling, ok } from "@/lib/api"
import { withAuth } from "@/lib/api"
import { withBusinessContext } from "@/lib/api/pipeline"
import { rateLimitByUser } from "@/lib/rate-limit"

function getMonthRange(monthOffset: number = 0): { start: Date; end: Date } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() - monthOffset

  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999)

  return { start, end }
}

export const GET = withErrorHandling(withAuth(withBusinessContext(async (_req: NextRequest, { auth, business }) => {
  await rateLimitByUser(auth.userId, 10, 60_000)

  const currentMonth = getMonthRange(0)
  const previousMonth = getMonthRange(1)

  const allRequests = await db
    .select()
    .from(paymentRequests)
    .where(eq(paymentRequests.merchantId, business.businessId))

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
})))
