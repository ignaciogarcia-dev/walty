import { eq } from "drizzle-orm"
import { Router } from "express"
import { db, paymentRequests } from "@walty/db"
import type { BusinessActivityStats } from "@walty/shared/activity/types"
import { rateLimitByUser } from "@walty/shared/rate-limit"
import { asyncHandler } from "../middleware/asyncHandler.js"
import {
  withBusinessContext,
} from "../middleware/withBusiness.js"
import { withAuth } from "../middleware/withAuth.js"

export const activityRouter: Router = Router()

function getMonthRange(monthOffset = 0): { start: Date; end: Date } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() - monthOffset
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999)
  return { start, end }
}

function sumAmounts(amounts: string[]): string {
  return amounts
    .reduce<number>((acc, a) => {
      const n = parseFloat(a)
      return acc + (Number.isFinite(n) ? n : 0)
    }, 0)
    .toString()
}

activityRouter.get(
  "/activity/stats",
  withAuth,
  withBusinessContext,
  asyncHandler(async (req, res) => {
    const auth = req.auth!
    const business = req.business!
    await rateLimitByUser(auth.userId, 10, 60_000)

    const currentMonth = getMonthRange(0)
    const previousMonth = getMonthRange(1)

    const allRequests = await db
      .select()
      .from(paymentRequests)
      .where(eq(paymentRequests.merchantId, business.businessId))

    const inRange = (date: Date, range: { start: Date; end: Date }) =>
      date >= range.start && date <= range.end

    const currentMonthRequests = allRequests.filter((r) => {
      const d = r.status === "paid" && r.paidAt ? r.paidAt : r.createdAt
      return inRange(d, currentMonth)
    })
    const previousMonthRequests = allRequests.filter((r) => {
      const d = r.status === "paid" && r.paidAt ? r.paidAt : r.createdAt
      return inRange(d, previousMonth)
    })

    const currentPaid = currentMonthRequests.filter((r) => r.status === "paid")
    const currentFailed = currentMonthRequests.filter(
      (r) => r.status === "expired",
    )
    const previousPaid = previousMonthRequests.filter((r) => r.status === "paid")

    const currentSalesTotal = sumAmounts(
      currentPaid.map((r) => r.receivedAmountUsd ?? r.amountUsd),
    )
    const previousSalesTotal = sumAmounts(
      previousPaid.map((r) => r.receivedAmountUsd ?? r.amountUsd),
    )

    const totalRequests = currentPaid.length + currentFailed.length
    const successRate =
      totalRequests > 0 ? (currentPaid.length / totalRequests) * 100 : 0

    const prevNum = parseFloat(previousSalesTotal)
    const currNum = parseFloat(currentSalesTotal)
    const salesChangePercent =
      prevNum === 0
        ? currNum > 0
          ? 100
          : 0
        : ((currNum - prevNum) / prevNum) * 100

    const stats: BusinessActivityStats = {
      currentMonthSales: { total: currentSalesTotal, count: currentPaid.length },
      previousMonthSales: {
        total: previousSalesTotal,
        count: previousPaid.length,
      },
      currentMonthCompleted: currentPaid.length,
      currentMonthFailed: currentFailed.length,
      successRate,
      salesChangePercent,
    }

    res.json({ business: stats })
  }),
)
