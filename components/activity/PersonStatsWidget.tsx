"use client"
import { useQuery } from "@tanstack/react-query"
import { TrendUp, TrendDown, MoneyIcon, PaperPlaneTilt } from "@phosphor-icons/react"
import { useTranslation } from "@/hooks/useTranslation"
import type { PersonActivityStats } from "@/lib/activity/types"
import { formatCurrency, formatChangePercent } from "@/lib/activity/utils"

export const ACTIVITY_STATS_QUERY_KEY = ["activity-stats"] as const

export function PersonStatsWidget() {
	const { t } = useTranslation()
	const { data: stats, isLoading } = useQuery({
		queryKey: ACTIVITY_STATS_QUERY_KEY,
		queryFn: async () => {
			const res = await fetch("/api/activity/stats")
			if (!res.ok) throw new Error("Failed to fetch stats")
			const { data } = await res.json()
			return data.person as PersonActivityStats | undefined
		},
		staleTime: 5 * 60_000, // 5 min — monthly stats, don't change second to second
	})

	if (isLoading) {
		return (
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div className="rounded-3xl border bg-card p-4 animate-pulse">
					<div className="h-4 bg-muted w-24 mb-2" />
					<div className="h-8 bg-muted w-32" />
				</div>
				<div className="rounded-3xl border bg-card p-4 animate-pulse">
					<div className="h-4 bg-muted w-24 mb-2" />
					<div className="h-8 bg-muted w-32" />
				</div>
			</div>
		)
	}

	if (!stats) return null

	const expensesChange = stats.expensesChangePercent
	const sendsChange = stats.sendsChangePercent

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
			<div className="rounded-3xl border bg-card p-6">
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-2">
						<MoneyIcon className="h-5 w-5 text-muted-foreground" />
						<h3 className="text-sm font-semibold text-muted-foreground">{t("monthly-expenses")}</h3>
					</div>
					{expensesChange !== 0 && (
						<div className={`flex items-center gap-1 text-xs font-medium ${expensesChange >= 0 ? "text-destructive" : "text-green-600"}`}>
							{expensesChange >= 0 ? <TrendUp className="h-3 w-3" /> : <TrendDown className="h-3 w-3" />}
							{formatChangePercent(Math.abs(expensesChange))}
						</div>
					)}
				</div>
				<div className="space-y-1">
					<p className="text-2xl font-bold">{formatCurrency(stats.currentMonthExpenses.total)}</p>
					<p className="text-xs text-muted-foreground">
						{stats.currentMonthExpenses.count} {t(
							stats.currentMonthExpenses.count === 1 ? "stat-payment" : "stat-payments",
						)}
					</p>
				</div>
			</div>

			<div className="rounded-3xl border bg-card p-6">
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-2">
						<PaperPlaneTilt className="h-5 w-5 text-muted-foreground" />
						<h3 className="text-sm font-semibold text-muted-foreground">{t("monthly-transfers")}</h3>
					</div>
					{sendsChange !== 0 && (
						<div className={`flex items-center gap-1 text-xs font-medium ${sendsChange >= 0 ? "text-green-600" : "text-muted-foreground"}`}>
							{sendsChange >= 0 ? <TrendUp className="h-3 w-3" /> : <TrendDown className="h-3 w-3" />}
							{formatChangePercent(Math.abs(sendsChange))}
						</div>
					)}
				</div>
				<div className="space-y-1">
					<p className="text-2xl font-bold">{formatCurrency(stats.currentMonthSends.total)}</p>
					<p className="text-xs text-muted-foreground">
						{stats.currentMonthSends.count} {t(
							stats.currentMonthSends.count === 1 ? "stat-transfer" : "stat-transfers",
						)}
					</p>
				</div>
			</div>
		</div>
	)
}
