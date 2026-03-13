"use client"
import { useEffect, useState } from "react"
import { MoneyIcon, PaperPlaneTilt } from "@phosphor-icons/react"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ExplorerLink } from "@/components/wallet/ExplorerLink"
import { useTranslation } from "@/hooks/useTranslation"
import { getNetwork } from "@/lib/networks/networks"
import type { TransactionActivityItem, ActivityFilter } from "@/lib/activity/types"
import { formatCurrency } from "@/lib/activity/utils"
export function PersonActivityList() {
	const { t } = useTranslation()
	const [filter, setFilter] = useState<ActivityFilter>("all")
	const [items, setItems] = useState<TransactionActivityItem[]>([])
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		async function fetchActivity() {
			try {
				setLoading(true)
				const typeParam = filter === "all" ? "all" : filter === "payments" ? "payments" : "sends"
				const res = await fetch(`/api/tx/activity?type=${typeParam}&limit=50`)
				if (!res.ok) return
				const data = await res.json()
				setItems(data.items || [])
			} catch (error) {
				console.error("Failed to fetch activity", error)
			} finally {
				setLoading(false)
			}
		}
		fetchActivity()
	}, [filter])

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-3">
				<h2 className="text-sm font-semibold text-foreground shrink-0">{t("activity")}</h2>
			</div>

			<Tabs value={filter} onValueChange={(v) => setFilter(v as ActivityFilter)}>
				<TabsList>
					<TabsTrigger value="all">Todos</TabsTrigger>
					<TabsTrigger value="payments">Pagos</TabsTrigger>
					<TabsTrigger value="sends">Envíos</TabsTrigger>
				</TabsList>

				<TabsContent value={filter} className="mt-4">
					{loading ? (
						<div className="text-sm text-muted-foreground text-center py-8">Cargando...</div>
					) : items.length === 0 ? (
						<p className="text-xs text-muted-foreground text-center py-8">No hay transacciones</p>
					) : (
						<div className="flex flex-col gap-2">
							{items.map((item) => {
								const network = (() => {
									try {
										return getNetwork(item.chainId)
									} catch {
										return null
									}
								})()

								const isPayment = item.type === "payment"

								return (
									<div
										key={item.id}
										className="rounded-lg border bg-card px-4 py-3 flex flex-col gap-1.5"
									>
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2">
												{isPayment ? (
													<MoneyIcon className="h-4 w-4 text-muted-foreground" />
												) : (
													<PaperPlaneTilt className="h-4 w-4 text-muted-foreground" />
												)}
												<Badge
													variant={
														item.status === "confirmed"
															? "default"
															: item.status === "failed"
															? "destructive"
															: "secondary"
													}
												>
													{item.status === "confirmed"
														? t("confirmed")
														: item.status === "failed"
														? t("failed")
														: t("pending")}
												</Badge>
												{network && (
													<Badge variant="outline" className="text-[10px] px-1.5 py-0">
														{network.name}
													</Badge>
												)}
											</div>
											<span className="font-mono text-sm font-semibold">
												{formatCurrency(item.value)} {item.tokenSymbol}
											</span>
										</div>
										<div className="flex items-center justify-between">
											<p className="font-mono text-xs text-muted-foreground break-all">
												{isPayment ? "→" : "→"} {item.toAddress.slice(0, 10)}...{item.toAddress.slice(-8)}
											</p>
											<ExplorerLink hash={item.hash} chainId={item.chainId} />
										</div>
										<p className="text-xs text-muted-foreground">
											{new Date(item.createdAt).toLocaleDateString("es-AR", {
												year: "numeric",
												month: "short",
												day: "numeric",
												hour: "2-digit",
												minute: "2-digit",
											})}
										</p>
									</div>
								)
							})}
						</div>
					)}
				</TabsContent>
			</Tabs>
		</div>
	)
}
