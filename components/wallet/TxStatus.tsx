"use client"
import type { TxStatus as TxStatusType } from "@/hooks/useWallet"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ExplorerLink } from "./ExplorerLink"
import { useTranslation } from "@/hooks/useTranslation"

export function TxStatus({
	txStatus,
	txHash,
	txError,
	onResetTx,
}: {
	txStatus: TxStatusType
	txHash: string | null
	txError: string | null
	onResetTx: () => void
}) {
	const { t } = useTranslation()
	
	if (txStatus === "pending" || txStatus === "pending_on_chain") {
		return (
			<Alert>
				<Spinner />
				<AlertTitle>
					{txStatus === "pending" ? t("transaction-pending") : t("on-network-waiting")}
				</AlertTitle>
				{txHash && (
					<AlertDescription>
						<ExplorerLink hash={txHash} />
					</AlertDescription>
				)}
			</Alert>
		)
	}

	if (txStatus === "confirmed") {
		return (
			<div className="flex flex-col gap-1 rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20 px-4 py-3 text-sm">
				<div className="flex items-center justify-between">
					<span className="font-medium text-green-700 dark:text-green-400">{t("confirmed")}</span>
					<Button size="icon-sm" variant="ghost" onClick={onResetTx} aria-label={t("dismiss")} className="text-green-600 hover:text-green-800 -mr-1">
						×
					</Button>
				</div>
				{txHash && <ExplorerLink hash={txHash} />}
			</div>
		)
	}

	if (txStatus === "error") {
		return (
			<Alert variant="destructive">
				<AlertTitle className="flex items-center justify-between">
					<span>{t("error")}</span>
					<Button size="icon-sm" variant="ghost" onClick={onResetTx} aria-label={t("dismiss")} className="text-destructive hover:text-destructive/80 -mr-1 -mt-1">
						×
					</Button>
				</AlertTitle>
				{txError && <AlertDescription>{txError}</AlertDescription>}
			</Alert>
		)
	}

	return null
}
