"use client"
import { useQuery } from "@tanstack/react-query"
import { TrendUp, TrendDown, CurrencyDollar, ChartLineUp } from "@phosphor-icons/react"
import type { BusinessActivityStats } from "@/lib/activity/types"
import { formatCurrency, formatChangePercent } from "@/lib/activity/utils"
import { ACTIVITY_STATS_QUERY_KEY } from "./PersonStatsWidget"

export function BusinessStatsWidget() {
	const { data: stats, isLoading } = useQuery({
		queryKey: ACTIVITY_STATS_QUERY_KEY, // misma key — cache compartido con PersonStatsWidget
		queryFn: async () => {
			const res = await fetch("/api/activity/stats")
			if (!res.ok) throw new Error("Failed to fetch stats")
			const { data } = await res.json()
			return data.business as BusinessActivityStats | undefined
		},
		staleTime: 5 * 60_000,
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

	const salesChange = stats.salesChangePercent

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
			<div className="rounded-3xl border bg-card p-6">
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-2">
						<CurrencyDollar className="h-5 w-5 text-muted-foreground" />
						<h3 className="text-sm font-semibold text-muted-foreground">Ventas del mes</h3>
					</div>
					{salesChange !== 0 && (
						<div className={`flex items-center gap-1 text-xs font-medium ${salesChange >= 0 ? "text-green-600" : "text-destructive"}`}>
							{salesChange >= 0 ? <TrendUp className="h-3 w-3" /> : <TrendDown className="h-3 w-3" />}
							{formatChangePercent(Math.abs(salesChange))}
						</div>
					)}
				</div>
				<div className="space-y-1">
					<p className="text-2xl font-bold">{formatCurrency(stats.currentMonthSales.total)}</p>
					<p className="text-xs text-muted-foreground">
						{stats.currentMonthSales.count} {stats.currentMonthSales.count === 1 ? "cobro" : "cobros"} completados
					</p>
				</div>
			</div>

			<div className="rounded-3xl border bg-card p-6">
				<div className="flex items-center gap-2 mb-4">
					<ChartLineUp className="h-5 w-5 text-muted-foreground" />
					<h3 className="text-sm font-semibold text-muted-foreground">Tasa de éxito</h3>
				</div>
				<div className="space-y-1">
					<p className="text-2xl font-bold">{stats.successRate.toFixed(1)}%</p>
					<p className="text-xs text-muted-foreground">
						{stats.currentMonthCompleted} completados / {stats.currentMonthCompleted + stats.currentMonthFailed} total
					</p>
				</div>
			</div>
		</div>
	)
}