"use client"
import { Badge } from "@/components/ui/badge"
import { useTranslation } from "@/hooks/useTranslation"

export function BalanceCard({
	address,
	balance,
}: {
	address: string | null
	balance: string | null
}) {
	const { t } = useTranslation()
	
	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<Badge variant="outline" className="gap-1.5 font-mono text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400">
					<span className="size-1.5 rounded-full bg-amber-500 shrink-0" />
					Ethereum — MAINNET
				</Badge>
			</div>

			<div className="rounded-xl border bg-card p-6 flex flex-col gap-2">
				<p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">{t("balance")}</p>
				<p className="text-4xl font-bold text-foreground tabular-nums">
					{balance ?? <span className="text-muted-foreground">—</span>}
					<span className="ml-2 text-lg font-medium text-muted-foreground">ETH</span>
				</p>
				{address && (
					<p className="mt-1 font-mono text-xs text-muted-foreground break-all">{address}</p>
				)}
			</div>
		</div>
	)
}
