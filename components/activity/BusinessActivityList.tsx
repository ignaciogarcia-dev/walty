"use client"
import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { MoneyIcon, Clock } from "@phosphor-icons/react"
import { Skeleton } from "@/components/ui/skeleton"
import { ExplorerLink } from "@/components/wallet/ExplorerLink"
import { useTranslation } from "@/hooks/useTranslation"
import { getNetwork } from "@/lib/networks/networks"
import type { PaymentRequestHistoryItem, PaymentRequestStatusFilter } from "@/lib/activity/types"
import { formatActivityUsd, groupActivityByDate, truncateMiddle } from "@/lib/activity/utils"
import { cn } from "@/utils/style"

type ItemWithSort = PaymentRequestHistoryItem & { sortAt: number }

export function BusinessActivityList() {
	const { t, locale } = useTranslation()
	const [filter, setFilter] = useState<PaymentRequestStatusFilter>("paid")

	const { data: items = [], isLoading } = useQuery({
		queryKey: ["payment-requests-history", filter],
		queryFn: async () => {
			const res = await fetch(`/api/payment-requests/history?status=${filter}&limit=50`)
			if (!res.ok) throw new Error("Failed to fetch activity")
			const { data } = await res.json()
			return (data.items ?? []) as PaymentRequestHistoryItem[]
		},
		staleTime: 60_000,
	})

	const withSort: ItemWithSort[] = useMemo(
		() =>
			items.map((item) => ({
				...item,
				sortAt: Date.parse(item.paidAt ?? item.createdAt),
			})),
		[items],
	)

	const sorted = useMemo(
		() => [...withSort].filter((i) => Number.isFinite(i.sortAt)).sort((a, b) => b.sortAt - a.sortAt),
		[withSort],
	)

	const groups = useMemo(() => groupActivityByDate(sorted, locale), [sorted, locale])

	const timeFmt: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" }

	return (
		<div className="flex flex-col gap-4">
			<h2 className="text-sm font-semibold text-foreground">{t("activity")}</h2>

			<div className="flex flex-wrap gap-2">
				{(
					[
						{ value: "paid" as const, label: t("completed") },
						{ value: "expired" as const, label: t("expired") },
						{ value: "all" as const, label: t("all") },
					] as const
				).map(({ value, label }) => (
					<button
						key={value}
						type="button"
						onClick={() => setFilter(value)}
						className={cn(
							"rounded-xl px-3 py-1.5 text-sm font-medium transition-colors",
							filter === value
								? "bg-primary text-primary-foreground"
								: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
						)}
					>
						{label}
					</button>
				))}
			</div>

			<div className="mt-4">
				{isLoading && (
					<div className="flex flex-col gap-10 pt-10">
						{[0, 1, 2].map((i) => (
							<div key={i} className="flex items-center gap-4">
								<Skeleton className="size-10 rounded-full" />
								<div className="flex-1 space-y-2">
									<Skeleton className="h-8 w-32" />
									<Skeleton className="h-6 w-24" />
								</div>
								<Skeleton className="h-4 w-20" />
							</div>
						))}
					</div>
				)}

				{!isLoading && items.length === 0 && (
					<p className="text-sm text-muted-foreground text-center py-6">{t("no-collections")}</p>
				)}

				{!isLoading && groups.length > 0 && (
					<div className="flex flex-col">
						{groups.map((group) => (
							<div key={group.label}>
								<div className="px-1">
									<span className="text-sm font-medium text-foreground">{group.label}</span>
								</div>

								<ul className="flex flex-col gap-4">
									{group.items.map((item) => {
											const network = (() => {
												try {
													return getNetwork(item.chainId)
												} catch {
													return null
												}
											})()
											const isPaid = item.status === "paid"
											const isExpired = item.status === "expired"
											const isConfirming = item.status === "confirming"

											const title = isPaid
												? t("paid")
												: isExpired
													? t("expired")
													: isConfirming
														? t("confirming")
														: t("pending")

											const displayUsd = (isPaid && item.receivedAmountUsd) ? item.receivedAmountUsd : item.amountUsd
											const amount = `${formatActivityUsd(displayUsd)} ${item.tokenSymbol}`
											const time = new Date(item.sortAt).toLocaleTimeString(locale, timeFmt)

											const subtitleParts = [
												item.txHash ? truncateMiddle(item.txHash, 8, 6) : null,
												network?.name ?? null,
											].filter(Boolean)

											return (
												<li
													key={item.id}
													className="flex items-center gap-3 px-5 py-5 border rounded-3xl bg-card"
												>
													<div
														className={
															isPaid
																? "flex size-10 shrink-0 items-center justify-center rounded-full text-emerald-600 border border-emerald-200 dark:border-emerald-800"
																: isExpired
																	? "flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground border border-border"
																	: "flex size-10 shrink-0 items-center justify-center rounded-full text-amber-600 border border-amber-200 dark:border-amber-800"
														}
													>
														{isPaid || isExpired ? (
															<MoneyIcon className="size-5" weight="bold" />
														) : (
															<Clock className="size-5" weight="bold" />
														)}
													</div>

													<div className="flex min-w-0 flex-1 flex-col gap-1">
														<span className="truncate text-sm font-semibold text-foreground">
															{t("cashier-movement-collection")}
														</span>
														<span className="truncate text-xs text-muted-foreground">
															{title}
															{subtitleParts.length > 0 ? ` · ${subtitleParts.join(" · ")}` : ""}
														</span>
														{item.txHash && (
															<div className="pt-0.5">
																<ExplorerLink hash={item.txHash} chainId={item.chainId} />
															</div>
														)}
													</div>

													<div className="flex shrink-0 flex-col items-end">
														<span
															className={
																isPaid
																	? "text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400"
																	: isExpired
																		? "text-sm font-semibold tabular-nums text-muted-foreground line-through"
																		: "text-sm font-semibold tabular-nums text-foreground"
															}
														>
															{isPaid ? "+" : ""}
															{amount}
														</span>
														<time
															className="text-xs text-muted-foreground"
															dateTime={new Date(item.sortAt).toISOString()}
														>
															{time}
														</time>
													</div>
												</li>
											)
										})}
									</ul>
								</div>
							))}
						</div>
					)}
			</div>
		</div>
	)
}
