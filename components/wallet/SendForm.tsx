"use client"
import { useEffect, useRef, useState } from "react"
import { isAddress } from "viem"
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
import { resolveEns } from "@/lib/ens"

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
	const [ensResolving, setEnsResolving] = useState(false)
	const [resolvedAddress, setResolvedAddress] = useState<`0x${string}` | null>(null)
	const [ensError, setEnsError] = useState<string | null>(null)
	const ensDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

	// ENS resolution — debounced 600ms, only when input looks like a name
	useEffect(() => {
		setResolvedAddress(null)
		setEnsError(null)

		// Skip resolution if it's already a hex address or doesn't contain a dot
		if (isAddress(to) || !to.includes(".")) return

		if (ensDebounce.current) clearTimeout(ensDebounce.current)
		setEnsResolving(true)

		ensDebounce.current = setTimeout(async () => {
			const addr = await resolveEns(to)
			setEnsResolving(false)
			if (addr) {
				setResolvedAddress(addr)
			} else {
				setEnsError(t("ens-not-found"))
			}
		}, 600)

		return () => {
			if (ensDebounce.current) clearTimeout(ensDebounce.current)
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [to])

	useEffect(() => {
		if (txStatus === "confirmed") {
			setTo("")
			setAmount("")
			setResolvedAddress(null)
		}
	}, [txStatus])

	// Use resolved ENS address if available, otherwise use the raw input
	const effectiveTo = resolvedAddress ?? to

	async function handleOpenModal() {
		if (!effectiveTo || !amount) return
		setGasEstimate(null)
		setGasError(null)
		setShowModal(true)
		try {
			const estimate = await onEstimateGas(effectiveTo, amount)
			setGasEstimate(estimate)
		} catch {
			setGasError(t("could-not-estimate-gas"))
		}
	}

	async function handleConfirm() {
		setShowModal(false)
		await onSend(effectiveTo, amount)
	}

	const isBusy = txStatus === "pending" || txStatus === "pending_on_chain"
	const canSubmit = !isBusy && !!effectiveTo && !!amount && !ensResolving && !ensError

	return (
		<>
			<div className="rounded-xl border bg-card p-6 flex flex-col gap-4">
				<h2 className="font-semibold text-foreground">{t("send-eth")}</h2>

				<div className="flex flex-col gap-1.5">
					<Label htmlFor="tx-to">{t("destination-address")}</Label>
					<Input
						id="tx-to"
						type="text"
						placeholder="0x… or name.eth"
						value={to}
						onChange={(e) => setTo(e.target.value)}
						className="font-mono"
					/>
					{ensResolving && (
						<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
							<Spinner className="size-3" />
							{t("resolving-ens")}
						</div>
					)}
					{resolvedAddress && (
						<p className="text-xs text-muted-foreground font-mono break-all">
							→ {resolvedAddress}
						</p>
					)}
					{ensError && (
						<p className="text-xs text-destructive">{ensError}</p>
					)}
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

				<Button onClick={handleOpenModal} disabled={!canSubmit} className="w-full">
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
							Ethereum — MAINNET
						</Badge>

						<div className="flex flex-col gap-0.5">
							<p className="text-xs text-muted-foreground">{t("destination")}</p>
							{to !== effectiveTo && (
								<p className="text-xs text-muted-foreground">{to}</p>
							)}
							<p className="font-mono text-sm break-all">{effectiveTo}</p>
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
