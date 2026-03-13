"use client"
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ExplorerLink } from "@/components/wallet/ExplorerLink"
import { useTranslation } from "@/hooks/useTranslation"
import { getNetwork } from "@/lib/networks/networks"
import type { PaymentRequestHistoryItem, PaymentRequestStatusFilter } from "@/lib/activity/types"
import { formatCurrency } from "@/lib/activity/utils"

export function BusinessActivityList() {
	const { t } = useTranslation()
	const [filter, setFilter] = useState<PaymentRequestStatusFilter>("all")
	const [items, setItems] = useState<PaymentRequestHistoryItem[]>([])
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		async function fetchActivity() {
			try {
				setLoading(true)
				const res = await fetch(`/api/payment-requests/history?status=${filter}&limit=50`)
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

			<Tabs value={filter} onValueChange={(v) => setFilter(v as PaymentRequestStatusFilter)}>
				<TabsList>
					<TabsTrigger value="all">Todos</TabsTrigger>
					<TabsTrigger value="paid">Completados</TabsTrigger>
					<TabsTrigger value="expired">Fallidos</TabsTrigger>
				</TabsList>

				<TabsContent value={filter} className="mt-4">
					{loading ? (
						<div className="text-sm text-muted-foreground text-center py-8">Cargando...</div>
					) : items.length === 0 ? (
						<p className="text-xs text-muted-foreground text-center py-8">No hay cobros</p>
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

								const isPaid = item.status === "paid"
								const isExpired = item.status === "expired"

								return (
									<div
										key={item.id}
										className="rounded-lg border bg-card px-4 py-3 flex flex-col gap-1.5"
									>
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2">
												<Badge
													variant={
														isPaid
															? "default"
															: isExpired
															? "destructive"
															: item.status === "confirming"
															? "secondary"
															: "outline"
													}
												>
													{isPaid
														? "Pagado"
														: isExpired
														? "Expirado"
														: item.status === "confirming"
														? "Confirmando"
														: "Pendiente"}
												</Badge>
												{network && (
													<Badge variant="outline" className="text-[10px] px-1.5 py-0">
														{network.name}
													</Badge>
												)}
											</div>
											<span className="font-mono text-sm font-semibold">
												{formatCurrency(item.amountUsd)} {item.tokenSymbol}
											</span>
										</div>
										{item.txHash && (
											<div className="flex items-center justify-end">
												<ExplorerLink hash={item.txHash} chainId={item.chainId} />
											</div>
										)}
										<p className="text-xs text-muted-foreground">
											{item.paidAt
												? `Pagado: ${new Date(item.paidAt).toLocaleDateString("es-AR", {
														year: "numeric",
														month: "short",
														day: "numeric",
														hour: "2-digit",
														minute: "2-digit",
												  })}`
												: `Creado: ${new Date(item.createdAt).toLocaleDateString("es-AR", {
														year: "numeric",
														month: "short",
														day: "numeric",
														hour: "2-digit",
														minute: "2-digit",
												  })}`}
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
