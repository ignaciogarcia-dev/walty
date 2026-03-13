"use client"
import { useEffect, useState } from "react"
import { TrendUp, TrendDown, CurrencyDollar, ChartLineUp } from "@phosphor-icons/react"
import type { BusinessActivityStats } from "@/lib/activity/types"
import { formatCurrency, formatChangePercent } from "@/lib/activity/utils"

export function BusinessStatsWidget() {
	const [stats, setStats] = useState<BusinessActivityStats | null>(null)
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		async function fetchStats() {
			try {
				const res = await fetch("/api/activity/stats")
				if (!res.ok) return
				const data = await res.json()
				if (data.business) {
					setStats(data.business)
				}
			} catch (error) {
				console.error("Failed to fetch stats", error)
			} finally {
				setLoading(false)
			}
		}
		fetchStats()
	}, [])

	if (loading) {
		return (
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div className="rounded-lg border bg-card p-4 animate-pulse">
					<div className="h-4 bg-muted w-24 mb-2" />
					<div className="h-8 bg-muted w-32" />
				</div>
				<div className="rounded-lg border bg-card p-4 animate-pulse">
					<div className="h-4 bg-muted w-24 mb-2" />
					<div className="h-8 bg-muted w-32" />
				</div>
			</div>
		)
	}

	if (!stats) {
		return null
	}

	const salesChange = stats.salesChangePercent

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
			{/* Ventas del mes */}
			<div className="rounded-lg border bg-card p-6">
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-2">
						<CurrencyDollar className="h-5 w-5 text-muted-foreground" />
						<h3 className="text-sm font-semibold text-muted-foreground">Ventas del mes</h3>
					</div>
					{salesChange !== 0 && (
						<div
							className={`flex items-center gap-1 text-xs font-medium ${
								salesChange >= 0 ? "text-green-600" : "text-destructive"
							}`}
						>
							{salesChange >= 0 ? (
								<TrendUp className="h-3 w-3" />
							) : (
								<TrendDown className="h-3 w-3" />
							)}
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

			{/* Tasa de éxito */}
			<div className="rounded-lg border bg-card p-6">
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
