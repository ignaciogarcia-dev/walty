"use client"
import { useEffect, useState } from "react"
import { TrendUp, TrendDown, MoneyIcon, PaperPlaneTilt } from "@phosphor-icons/react"
import type { PersonActivityStats } from "@/lib/activity/types"
import { formatCurrency, formatChangePercent } from "@/lib/activity/utils"

export function PersonStatsWidget() {
	const [stats, setStats] = useState<PersonActivityStats | null>(null)
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		async function fetchStats() {
			try {
				const res = await fetch("/api/activity/stats")
				if (!res.ok) return
				const data = await res.json()
				if (data.person) {
					setStats(data.person)
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

	const expensesChange = stats.expensesChangePercent
	const sendsChange = stats.sendsChangePercent

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
			{/* Gastos del mes */}
			<div className="rounded-lg border bg-card p-6">
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-2">
						<MoneyIcon className="h-5 w-5 text-muted-foreground" />
						<h3 className="text-sm font-semibold text-muted-foreground">Gastos del mes</h3>
					</div>
					{expensesChange !== 0 && (
						<div
							className={`flex items-center gap-1 text-xs font-medium ${
								expensesChange >= 0 ? "text-destructive" : "text-green-600"
							}`}
						>
							{expensesChange >= 0 ? (
								<TrendUp className="h-3 w-3" />
							) : (
								<TrendDown className="h-3 w-3" />
							)}
							{formatChangePercent(Math.abs(expensesChange))}
						</div>
					)}
				</div>
				<div className="space-y-1">
					<p className="text-2xl font-bold">{formatCurrency(stats.currentMonthExpenses.total)}</p>
					<p className="text-xs text-muted-foreground">
						{stats.currentMonthExpenses.count} {stats.currentMonthExpenses.count === 1 ? "pago" : "pagos"}
					</p>
				</div>
			</div>

			{/* Envíos del mes */}
			<div className="rounded-lg border bg-card p-6">
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-2">
						<PaperPlaneTilt className="h-5 w-5 text-muted-foreground" />
						<h3 className="text-sm font-semibold text-muted-foreground">Envíos del mes</h3>
					</div>
					{sendsChange !== 0 && (
						<div
							className={`flex items-center gap-1 text-xs font-medium ${
								sendsChange >= 0 ? "text-green-600" : "text-muted-foreground"
							}`}
						>
							{sendsChange >= 0 ? (
								<TrendUp className="h-3 w-3" />
							) : (
								<TrendDown className="h-3 w-3" />
							)}
							{formatChangePercent(Math.abs(sendsChange))}
						</div>
					)}
				</div>
				<div className="space-y-1">
					<p className="text-2xl font-bold">{formatCurrency(stats.currentMonthSends.total)}</p>
					<p className="text-xs text-muted-foreground">
						{stats.currentMonthSends.count} {stats.currentMonthSends.count === 1 ? "envío" : "envíos"}
					</p>
				</div>
			</div>
		</div>
	)
}
