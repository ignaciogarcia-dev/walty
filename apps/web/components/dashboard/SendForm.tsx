"use client"

import { useState, useMemo } from "react"
import { isAddress } from "viem"
import { ArrowLeft, CheckCircle, Warning } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useWalletContext } from "@/components/wallet/context"
import { usePortfolio } from "@/hooks/usePortfolio"
import { useTranslation } from "@/hooks/useTranslation"
import { getTxUrl } from "@/lib/explorer/getTxUrl"

export function SendForm() {
	const router = useRouter()
	const { t } = useTranslation()
	const { address, executeTransfer, txStatus, txHash, txError, resetTx } = useWalletContext()
	const { positions, loading: loadingPortfolio } = usePortfolio(address)

	const tokens = useMemo(
		() => positions.filter((p) => parseFloat(p.balance) > 0),
		[positions],
	)

	const [selectedIdx, setSelectedIdx] = useState(0)
	const [to, setTo] = useState("")
	const [amount, setAmount] = useState("")

	const selected = tokens[selectedIdx]
	const maxBalance = selected ? parseFloat(selected.balance) : 0

	const addressError = to && !isAddress(to) ? t("send-invalid-address") : null
	const amountError =
		amount && (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0)
			? t("send-amount-too-low")
			: amount && parseFloat(amount) > maxBalance
				? t("send-amount-exceeds-balance")
				: null
	const canSend =
		!!selected &&
		isAddress(to) &&
		!!amount &&
		!amountError &&
		txStatus === "idle"

	async function handleSend() {
		if (!canSend || !selected) return
		await executeTransfer(selected.token, to, amount, selected.chainId)
	}

	function handleReset() {
		resetTx()
		setTo("")
		setAmount("")
		setSelectedIdx(0)
	}

	if (txStatus === "confirmed" && txHash) {
		return (
			<div className="flex flex-col items-center gap-4 px-4 py-10 text-center">
				<CheckCircle className="h-12 w-12 text-green-500" weight="fill" />
				<p className="text-lg font-semibold">{t("transfer-sent")}</p>
				<a
					href={getTxUrl(txHash, selected?.chainId ?? 137)}
					target="_blank"
					rel="noopener noreferrer"
					className="text-sm text-muted-foreground underline"
				>
					{txHash.slice(0, 10)}…{txHash.slice(-8)}
				</a>
				<Button variant="outline" onClick={handleReset}>
					{t("transfer")}
				</Button>
			</div>
		)
	}

	return (
		<div className="mx-auto max-w-md px-4 py-6 flex flex-col gap-5">
			<div className="flex items-center gap-2">
				<Button variant="ghost" size="icon" onClick={() => router.back()}>
					<ArrowLeft className="h-5 w-5" />
				</Button>
				<h1 className="text-xl font-semibold">{t("transfer")}</h1>
			</div>

			{loadingPortfolio ? (
				<div className="flex justify-center py-10">
					<Spinner className="size-6" />
				</div>
			) : tokens.length === 0 ? (
				<p className="text-sm text-muted-foreground text-center py-10">
					{t("no-balance-hint")}
				</p>
			) : (
				<>
					{/* Token selector */}
					<div className="flex flex-col gap-1">
						<label className="text-sm font-medium">{t("tokens")}</label>
						<div className="flex flex-wrap gap-2">
							{tokens.map((p, i) => (
								<button
									key={`${p.chainId}-${p.token.symbol}`}
									onClick={() => setSelectedIdx(i)}
									className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
										i === selectedIdx
											? "border-primary bg-primary text-primary-foreground"
											: "border-border bg-background hover:bg-accent"
									}`}
								>
									{p.token.symbol}
									<span className="ml-1.5 text-xs opacity-70">
										{parseFloat(p.balance).toFixed(2)}
									</span>
								</button>
							))}
						</div>
						{selected && (
							<p className="text-xs text-muted-foreground">
								{t("send-only-on")} {selected.chainId === 137 ? "Polygon" : `chain ${selected.chainId}`}
							</p>
						)}
					</div>

					{/* Recipient */}
					<div className="flex flex-col gap-1">
						<label className="text-sm font-medium" htmlFor="send-to">
							{t("recipient")}
						</label>
						<Input
							id="send-to"
							placeholder="0x…"
							value={to}
							onChange={(e) => setTo(e.target.value)}
							disabled={txStatus === "pending" || txStatus === "pending_on_chain"}
						/>
						{addressError && (
							<p className="text-xs text-destructive">{addressError}</p>
						)}
					</div>

					{/* Amount */}
					<div className="flex flex-col gap-1">
						<div className="flex items-center justify-between">
							<label className="text-sm font-medium" htmlFor="send-amount">
								{t("amount")}
							</label>
							<button
								className="text-xs text-muted-foreground underline"
								onClick={() => setAmount(selected ? selected.balance : "")}
							>
								{t("send-max")}
							</button>
						</div>
						<Input
							id="send-amount"
							type="number"
							min="0"
							placeholder="0.00"
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
							disabled={txStatus === "pending" || txStatus === "pending_on_chain"}
						/>
						{amountError && (
							<p className="text-xs text-destructive">{amountError}</p>
						)}
					</div>

					{/* Error */}
					{txStatus === "error" && txError && (
						<div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
							<Warning className="h-4 w-4 shrink-0" />
							{txError}
						</div>
					)}

					<Button
						onClick={handleSend}
						disabled={!canSend}
						className="w-full"
						data-testid="send-submit"
					>
						{txStatus === "pending" || txStatus === "pending_on_chain" ? (
							<><Spinner className="mr-2 size-4" />{t("sending")}</>
						) : (
							t("confirm-send")
						)}
					</Button>
				</>
			)}
		</div>
	)
}
