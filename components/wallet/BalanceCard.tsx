"use client"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { useTranslation } from "@/hooks/useTranslation"
import { usePortfolio } from "@/hooks/usePortfolio"

export function BalanceCard({
	address,
	balance,
}: {
	address: string | null
	balance: string | null
}) {
	const { t } = useTranslation()
	const { totalUsd, loading } = usePortfolio(address)
	
	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<Badge variant="outline" className="gap-1.5 font-mono text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400">
					<span className="size-1.5 rounded-full bg-amber-500 shrink-0" />
					Ethereum — MAINNET
				</Badge>
			</div>

			<div className="rounded-xl border bg-card p-6 flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">{t("balance")}</p>
					{loading && <Spinner className="size-3" />}
				</div>
				<p className="text-4xl font-bold text-foreground tabular-nums">
					{loading ? (
						<span className="text-muted-foreground">—</span>
					) : (
						<>${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
					)}
				</p>
				{address && (
					<p className="mt-1 font-mono text-xs text-muted-foreground break-all">{address}</p>
				)}
			</div>
		</div>
	)
}
