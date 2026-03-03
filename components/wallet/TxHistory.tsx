"use client"
import type { TxRecord } from "@/hooks/useWallet"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ExplorerLink } from "./ExplorerLink"
import { useTranslation } from "@/hooks/useTranslation"

export function TxHistory({ txHistory }: { txHistory: TxRecord[] }) {
	const { t } = useTranslation()
	
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-3">
				<h2 className="text-sm font-semibold text-foreground shrink-0">{t("history")}</h2>
				<Separator className="flex-1" />
			</div>

			{txHistory.length === 0 ? (
				<p className="text-xs text-muted-foreground">{t("no-transactions-yet")}</p>
			) : (
				<div className="flex flex-col gap-2">
					{txHistory.map((tx) => (
						<div key={tx.id} className="rounded-lg border bg-card px-4 py-3 flex flex-col gap-1.5">
							<div className="flex items-center justify-between">
								<Badge
									variant={
										tx.status === "confirmed" ? "default" :
										tx.status === "failed" ? "destructive" : "secondary"
									}
								>
									{tx.status === "confirmed" ? t("confirmed") : tx.status === "failed" ? t("failed") : t("pending")}
								</Badge>
								<span className="font-mono text-sm font-semibold">{tx.amount} ETH</span>
							</div>
							<p className="font-mono text-xs text-muted-foreground break-all">→ {tx.toAddress}</p>
							<ExplorerLink hash={tx.txHash} />
						</div>
					))}
				</div>
			)}
		</div>
	)
}
