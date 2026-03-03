"use client"
import { useEffect, useState } from "react"
import type { TxStatus } from "@/hooks/useWallet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Badge } from "@/components/ui/badge"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog"
import { TxStatus as TxStatusDisplay } from "./TxStatus"
import { useTranslation } from "@/hooks/useTranslation"

export function SendForm({
	onEstimateGas,
	onSend,
	txStatus,
	txHash,
	txError,
	onResetTx,
}: {
	onEstimateGas: (to: string, amount: string) => Promise<string>
	onSend: (to: string, amount: string) => Promise<void>
	txStatus: TxStatus
	txHash: string | null
	txError: string | null
	onResetTx: () => void
}) {
	const { t } = useTranslation()
	const [to, setTo] = useState("")
	const [amount, setAmount] = useState("")
	const [showModal, setShowModal] = useState(false)
	const [gasEstimate, setGasEstimate] = useState<string | null>(null)
	const [gasError, setGasError] = useState<string | null>(null)

	useEffect(() => {
		if (txStatus === "confirmed") {
			setTo("")
			setAmount("")
		}
	}, [txStatus])

	async function handleOpenModal() {
		if (!to || !amount) return
		setGasEstimate(null)
		setGasError(null)
		setShowModal(true)
		try {
			const estimate = await onEstimateGas(to, amount)
			setGasEstimate(estimate)
		} catch {
			setGasError(t("could-not-estimate-gas"))
		}
	}

	async function handleConfirm() {
		setShowModal(false)
		await onSend(to, amount)
	}

	const isBusy = txStatus === "pending" || txStatus === "pending_on_chain"

	return (
		<>
			<div className="rounded-xl border bg-card p-6 flex flex-col gap-4">
				<h2 className="font-semibold text-foreground">{t("send-eth")}</h2>

				<div className="flex flex-col gap-1.5">
					<Label htmlFor="tx-to">{t("destination-address")}</Label>
					<Input
						id="tx-to"
						type="text"
						placeholder="0x..."
						value={to}
						onChange={(e) => setTo(e.target.value)}
						className="font-mono"
					/>
				</div>

				<div className="flex flex-col gap-1.5">
					<Label htmlFor="tx-amount">{t("amount-eth")}</Label>
					<Input
						id="tx-amount"
						type="text"
						placeholder="0.001"
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
					/>
				</div>

				<Button onClick={handleOpenModal} disabled={isBusy || !to || !amount} className="w-full">
					{isBusy ? (
						<>
							<Spinner />
							{t("sending")}
						</>
					) : (
						t("send-eth")
					)}
				</Button>

				<TxStatusDisplay
					txStatus={txStatus}
					txHash={txHash}
					txError={txError}
					onResetTx={onResetTx}
				/>
			</div>

			<Dialog open={showModal} onOpenChange={setShowModal}>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>{t("confirm-transaction")}</DialogTitle>
					</DialogHeader>

					<div className="flex flex-col gap-4 py-2">
						<Badge variant="outline" className="w-fit gap-1.5 font-mono text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400">
							<span className="size-1.5 rounded-full bg-amber-500 shrink-0" />
							Sepolia — TESTNET
						</Badge>

						<div className="flex flex-col gap-0.5">
							<p className="text-xs text-muted-foreground">{t("destination")}</p>
							<p className="font-mono text-sm break-all">{to}</p>
						</div>

						<div className="flex flex-col gap-0.5">
							<p className="text-xs text-muted-foreground">{t("amount")}</p>
							<p className="font-mono font-semibold">{amount} ETH</p>
						</div>

						<div className="flex flex-col gap-0.5">
							<p className="text-xs text-muted-foreground">{t("estimated-gas")}</p>
							{gasEstimate === null && !gasError ? (
								<div className="flex items-center gap-1.5 text-muted-foreground text-sm">
									<Spinner className="size-3" />
									{t("calculating")}
								</div>
							) : gasError ? (
								<p className="text-sm text-destructive">{gasError}</p>
							) : (
								<p className="font-mono text-sm">~{gasEstimate} ETH</p>
							)}
						</div>
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => setShowModal(false)} className="flex-1">
							{t("cancel")}
						</Button>
						<Button
							onClick={handleConfirm}
							disabled={gasEstimate === null && !gasError}
							className="flex-1"
						>
							{t("confirm-send")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}
