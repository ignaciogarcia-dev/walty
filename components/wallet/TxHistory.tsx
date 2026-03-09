"use client"
import type { TxRecord } from "@/hooks/useWallet"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ExplorerLink } from "./ExplorerLink"
import { useTranslation } from "@/hooks/useTranslation"
import { getNetwork } from "@/lib/networks/networks"

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
					{txHistory.map((tx) => {
						const network = (() => {
							try { return getNetwork(tx.chainId) } catch { return null }
						})()

						return (
							<div key={tx.id} className="rounded-lg border bg-card px-4 py-3 flex flex-col gap-1.5">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-1.5">
										<Badge
											variant={
												tx.status === "confirmed" ? "default" :
												tx.status === "failed" ? "destructive" : "secondary"
											}
										>
											{tx.status === "confirmed" ? t("confirmed") : tx.status === "failed" ? t("failed") : t("pending")}
										</Badge>
										{network && (
											<Badge variant="outline" className="text-[10px] px-1.5 py-0">
												{network.name}
											</Badge>
										)}
									</div>
									<span className="font-mono text-sm font-semibold">
										{tx.value} {tx.tokenSymbol}
									</span>
								</div>
								<p className="font-mono text-xs text-muted-foreground break-all">→ {tx.toAddress}</p>
								<ExplorerLink hash={tx.hash} chainId={tx.chainId} />
							</div>
						)
					})}
				</div>
			)}
		</div>
	)
}
