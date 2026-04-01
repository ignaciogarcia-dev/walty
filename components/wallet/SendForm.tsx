"use client"
import { useEffect, useRef, useState, startTransition } from "react"
import { useQuery } from "@tanstack/react-query"
import { useDebounce } from "@/hooks/useDebounce"
import { isAddress } from "viem"
import { ArrowLeft, ArrowsDownUp } from "@phosphor-icons/react"
import type { TxStatus } from "@/hooks/useWallet"
import type { TokenPosition } from "@/hooks/usePortfolio"
import type { Token } from "@/lib/tokens/tokenRegistry"
import { getRelayToken } from "@/lib/tokens/tokenRegistry"
import { getNetwork, NETWORKS, type Network } from "@/lib/networks/networks"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { TxStatus as TxStatusDisplay } from "./TxStatus"
import { TokenAvatar } from "./TokenAvatar"
import { useTranslation } from "@/hooks/useTranslation"
import { ContactPickerDropdown } from "./ContactPickerDropdown"
import {
	calcBreakdown,
	getClientFeeConfig,
	type AmountBreakdown,
} from "@/hooks/useRelayTransfer"

type Step = "address" | "amount"
type InputMode = "sender" | "recipient"

// ─── Network badge ────────────────────────────────────────────────────────────

const NETWORK_DOT_COLOR: Record<number, string> = {
	1: "bg-gray-400",
	42161: "bg-blue-500",
	8453: "bg-blue-600",
	10: "bg-red-500",
	137: "bg-purple-500",
}

const NETWORK_LOGO: Record<number, string> = {
	137: "/networks/matic.svg",
}

function NetworkBadge({ network }: { network: Network | null }) {
	const logo = network ? NETWORK_LOGO[network.id] : null
	const color = network ? (NETWORK_DOT_COLOR[network.id] ?? "bg-muted") : "bg-muted"
	return (
		<div
			className={`absolute -bottom-0.5 -right-0.5 size-4 rounded-full border-2 border-background flex items-center justify-center overflow-hidden ${logo ? "bg-transparent" : color}`}
			title={network?.name}
		>
			{logo ? (
				// eslint-disable-next-line @next/next/no-img-element
				<img src={logo} alt={network?.name} className="size-full object-cover" />
			) : (
				<span className="text-[7px] font-bold text-white leading-none">
					{network?.name[0] ?? "?"}
				</span>
			)}
		</div>
	)
}

// ─── Step header ──────────────────────────────────────────────────────────────

function StepHeader({ onBack, token, imageUrl, network }: {
	onBack: () => void
	token: Token
	imageUrl: string | null
	network: Network | null
}) {
	return (
		<div className="flex items-center gap-3">
			<button
				onClick={onBack}
				className="cursor-pointer rounded-full p-1.5 transition-colors hover:bg-accent shrink-0"
				aria-label="Back"
			>
				<ArrowLeft className="size-4" />
			</button>
			<div className="flex items-center gap-2">
				<div className="relative shrink-0">
					<TokenAvatar symbol={token.symbol} imageUrl={imageUrl} sizeClass="size-8" />
					<NetworkBadge network={network} />
				</div>
				<span className="font-medium text-sm">{token.symbol}</span>
			</div>
		</div>
	)
}

// ─── Amount breakdown rows ────────────────────────────────────────────────────

function BreakdownRow({
	label,
	value,
	symbol,
	highlight,
	muted,
}: {
	label: string
	value: string
	symbol: string
	highlight?: boolean
	muted?: boolean
}) {
	return (
		<div className={`flex items-center justify-between py-1.5 ${muted ? "opacity-60" : ""}`}>
			<span className={`text-sm ${muted ? "text-muted-foreground" : "text-foreground"}`}>
				{label}
			</span>
			<span className={`font-mono text-sm font-semibold ${highlight ? "text-foreground" : "text-muted-foreground"}`}>
				{parseFloat(value).toFixed(6).replace(/\.?0+$/, "")} {symbol}
			</span>
		</div>
	)
}

function AmountBreakdownPanel({
	breakdown,
	symbol,
	mode,
}: {
	breakdown: AmountBreakdown
	symbol: string
	mode: InputMode
}) {
	const { t } = useTranslation()
	return (
		<div className="rounded-2xl border bg-muted/40 px-4 py-2 flex flex-col divide-y divide-border/60">
			<BreakdownRow
				label={mode === "sender" ? t("you-send") : t("sender-pays")}
				value={breakdown.grossAmount}
				symbol={symbol}
				highlight={mode === "sender"}
			/>
			<BreakdownRow
				label={`${t("fee")} (${(breakdown.feeBps / 100).toFixed(2)}%)`}
				value={breakdown.feeAmount}
				symbol={symbol}
				muted
			/>
			<BreakdownRow
				label={t("recipient-gets")}
				value={breakdown.netAmount}
				symbol={symbol}
				highlight={mode === "recipient"}
			/>
		</div>
	)
}

// ─── SendForm ─────────────────────────────────────────────────────────────────

export function SendForm({
	positions,
	onSend,
	txStatus,
	txHash,
	txError,
	onResetTx,
	selectedChainId,
	onChainChange,
	mode = "transfer",
	showChainSelector = true,
	networkSubtitle,
}: {
	positions: TokenPosition[]
	onSend: (token: Token, to: string, amount: string, chainId: number) => Promise<void>
	txStatus: TxStatus
	txHash: string | null
	txError: string | null
	onResetTx: () => void
	selectedChainId: number
	onChainChange: (chainId: number) => void
	mode?: "transfer" | "pay"
	showChainSelector?: boolean
	networkSubtitle?: string
}) {
	const { t } = useTranslation()

	const [step, setStep] = useState<Step>("address")
	const [selectedPosition, setSelectedPosition] = useState<TokenPosition | null>(null)
	const [to, setTo] = useState("")
	const [amount, setAmount] = useState("")
	const [inputMode, setInputMode] = useState<InputMode>("sender")
	const [showModal, setShowModal] = useState(false)

	const { feeBps } = getClientFeeConfig()

	// Auto-select USDC for the active chain
	useEffect(() => {
		const fromPortfolio = positions.find(
			(p) => p.chainId === selectedChainId && p.token.symbol === "USDC"
		)
		if (fromPortfolio) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setSelectedPosition(fromPortfolio)
			return
		}
		// Portfolio not yet loaded — build a zero-balance placeholder from registry
		const registryToken = getRelayToken(selectedChainId)
		if (registryToken) {
			setSelectedPosition({
				token: registryToken,
				chainId: selectedChainId,
				balance: "0",
				priceUsd: 1,
				valueUsd: 0,
				allocation: 0,
				imageUrl: null,
			})
		}
	}, [selectedChainId, positions])

	// Username resolution
	const isUsernameInput = to.startsWith("@")
	const usernameRaw = isUsernameInput ? to.slice(1).trim() : ""
	const debouncedUsername = useDebounce(usernameRaw, 600)

	const { data: resolvedData, isFetching: resolveIsFetching, error: resolveError } = useQuery({
		queryKey: ["username-resolve", debouncedUsername],
		queryFn: async () => {
			const res = await fetch(`/api/username/resolve?username=${encodeURIComponent(debouncedUsername)}`)
			if (!res.ok) throw new Error(t("username-not-found"))
			const { data } = await res.json()
			return { address: data.address as `0x${string}`, username: debouncedUsername }
		},
		enabled: isUsernameInput && !!debouncedUsername,
		staleTime: 5 * 60_000,
		retry: false,
	})

	const resolvedAddress = isUsernameInput ? (resolvedData?.address ?? null) : null
	const resolvedUsername = isUsernameInput ? (resolvedData?.username ?? null) : null
	const usernameError = isUsernameInput && !resolveIsFetching && resolveError instanceof Error
		? resolveError.message : null
	const usernameResolving = isUsernameInput && !!usernameRaw &&
		(usernameRaw !== debouncedUsername || resolveIsFetching)

	const network = (() => {
		try { return getNetwork(selectedChainId) } catch { return null }
	})()

	// Reset on confirmed
	const prevTxStatus = useRef(txStatus)
	useEffect(() => {
		if (prevTxStatus.current !== "confirmed" && txStatus === "confirmed") {
			startTransition(() => {
				setStep("address")
				setTo("")
				setAmount("")
				setInputMode("sender")
			})
		}
		prevTxStatus.current = txStatus
	}, [txStatus])

	function handleBack() {
		if (step === "amount") { setStep("address"); return }
		if (step === "address") {
			setTo("")
			onResetTx()
		}
	}

	function handleAmountChange(value: string) {
		if (!selectedPosition) return
		if (value !== "" && !/^\d*\.?\d*$/.test(value)) return
		setAmount(value)
	}

	const effectiveTo: string | null = resolvedAddress ?? (isAddress(to) ? to : null)

	// Amount breakdown
	const breakdown = selectedPosition
		? calcBreakdown(amount, inputMode, selectedPosition.token.decimals, feeBps)
		: null

	async function handleOpenModal() {
		if (!effectiveTo || !breakdown || !selectedPosition) return
		setShowModal(true)
	}

	async function handleConfirm() {
		if (!effectiveTo || !selectedPosition || !breakdown) return
		setShowModal(false)
		await onSend(selectedPosition.token, effectiveTo, breakdown.grossAmount, selectedChainId)
	}

	const hasBalance = parseFloat(selectedPosition?.balance ?? "0") > 0
	const isBusy = txStatus === "pending" || txStatus === "pending_on_chain"
	const parsedGross = parseFloat(breakdown?.grossAmount ?? "0")
	const parsedBalance = parseFloat(selectedPosition?.balance ?? "0")
	const exceedsBalance = !!breakdown && parsedGross > parsedBalance

	const canSubmit =
		hasBalance &&
		!isBusy &&
		!!effectiveTo &&
		!!breakdown &&
		parsedGross > 0 &&
		!exceedsBalance &&
		!usernameResolving &&
		!usernameError

	const actionLabel = mode === "pay" ? t("pay") : t("send")
	const pendingLabel = mode === "pay" ? t("paying") : t("sending")

	const token = selectedPosition?.token ?? null
	const balance = selectedPosition?.balance ?? "0"
	const imageUrl = selectedPosition?.imageUrl ?? null

	// ── Step 1: address input ─────────────────────────────────────────────────
	if (step === "address") {
		return (
			<div className="rounded-4xl border bg-card p-6 flex flex-col gap-4">
				<div className="flex items-center justify-between">
					<div className="flex flex-col gap-1">
						<h2 className="font-semibold text-foreground">{actionLabel}</h2>
						{networkSubtitle && (
							<p className="text-sm text-muted-foreground">{networkSubtitle}</p>
						)}
					</div>
					{token && (
						<div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-sm font-medium">
							<div className="relative shrink-0">
								<TokenAvatar symbol={token.symbol} imageUrl={imageUrl} sizeClass="size-5" />
								<NetworkBadge network={network} />
							</div>
							<span>{token.symbol}</span>
						</div>
					)}
				</div>

				{showChainSelector && NETWORKS.length > 1 && (
					<div className="flex gap-1.5 overflow-x-auto pb-1">
						{NETWORKS.map((net) => (
							<button
								key={net.id}
								onClick={() => onChainChange(net.id)}
								className={`cursor-pointer px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${selectedChainId === net.id
										? "bg-foreground text-background"
										: "bg-muted text-muted-foreground hover:bg-accent"
									}`}
							>
								{net.name}
							</button>
						))}
					</div>
				)}

				<div className="flex flex-col gap-1.5">
					<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
						{t("recipient")}
					</p>
					<div className="relative">
						<Input
							id="tx-to"
							type="text"
							placeholder={t("username-or-address")}
							value={to}
							onChange={(e) => setTo(e.target.value)}
							className="rounded-2xl pr-10"
							autoFocus
						/>
						<ContactPickerDropdown
							selectedChainId={selectedChainId}
							value={to}
							onSelect={(address) => setTo(address)}
						/>
					</div>
					{usernameResolving && (
						<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
							<Spinner className="size-3" />
							{t("resolving-username")}
						</div>
					)}
					{resolvedAddress && resolvedUsername && (
						<p className="text-xs text-muted-foreground font-mono break-all">
							@{resolvedUsername} → {resolvedAddress}
						</p>
					)}
					{usernameError && (
						<p className="text-xs text-destructive">{usernameError}</p>
					)}
				</div>

				<Button
					disabled={!effectiveTo || usernameResolving}
					onClick={() => setStep("amount")}
					className="w-full rounded-2xl"
				>
					{t("continue")}
				</Button>
			</div>
		)
	}

	if (!selectedPosition || !token) return null

	// ── Step 2: amount + breakdown + CTA ─────────────────────────────────────
	return (
		<>
			<div className="p-4 flex flex-col gap-6">
				<StepHeader onBack={handleBack} token={token} imageUrl={imageUrl} network={network} />

				{/* Amount input with mode toggle */}
				<div className="flex flex-col items-center gap-3 py-4">
					<div className="flex items-center gap-3 w-full justify-center">
						{/* Spacer to balance the toggle button on the right */}
						<div className="shrink-0 size-9" />
						<input
							id="tx-amount"
							type="text"
							inputMode="decimal"
							placeholder="0"
							value={amount}
							onChange={(e) => handleAmountChange(e.target.value)}
							disabled={!hasBalance}
							autoFocus
							className="min-w-0 flex-1 text-center text-6xl md:text-7xl font-semibold tracking-tight bg-transparent border-none outline-none placeholder:text-muted-foreground/30 disabled:cursor-not-allowed"
						/>
						{/* Toggle sender/recipient mode */}
						<button
							type="button"
							onClick={() => {
								setInputMode((prev) => prev === "sender" ? "recipient" : "sender")
								if (breakdown) {
									setAmount(inputMode === "sender" ? breakdown.netAmount : breakdown.grossAmount)
								}
							}}
							title={inputMode === "sender" ? t("switch-to-recipient-mode") : t("switch-to-sender-mode")}
							className="cursor-pointer shrink-0 rounded-full p-2 bg-muted hover:bg-accent transition-colors"
						>
							<ArrowsDownUp className="size-5 text-muted-foreground" />
						</button>
					</div>

					{/* Mode label */}
					<p className="text-xs text-muted-foreground">
						{inputMode === "sender" ? t("amount-you-send") : t("amount-recipient-gets")}
					</p>

					{/* Balance + max */}
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<span>
							{t("balance-label")}: {parseFloat(balance).toFixed(4)} {token.symbol}
						</span>
						{hasBalance && (
							<button
								type="button"
								onClick={() => {
									setInputMode("sender")
									setAmount(balance)
								}}
								className="cursor-pointer px-2 py-0.5 rounded-md bg-muted hover:bg-accent text-xs font-semibold transition-colors"
							>
								{t("max")}
							</button>
						)}
					</div>

					{exceedsBalance && (
						<p className="text-xs text-destructive">
							{t("insufficient-balance")}
						</p>
					)}
				</div>

				{/* Breakdown panel */}
				{breakdown && (
					<AmountBreakdownPanel
						breakdown={breakdown}
						symbol={token.symbol}
						mode={inputMode}
					/>
				)}

				{/* CTA */}
				{!hasBalance ? (
					<Button disabled className="w-full rounded-2xl opacity-60">
						{t("send-no-balance")} {token.symbol}
					</Button>
				) : (
					<Button
						onClick={handleOpenModal}
						disabled={!canSubmit}
						className="w-full rounded-2xl"
					>
						{isBusy ? (
							<><Spinner />{pendingLabel}</>
						) : exceedsBalance ? (
							t("insufficient-balance")
						) : (
							`${actionLabel} ${token.symbol}`
						)}
					</Button>
				)}

				{txStatus !== "confirmed" && (
					<TxStatusDisplay
						txStatus={txStatus}
						txHash={txHash}
						txError={txError}
						onResetTx={onResetTx}
					/>
				)}
			</div>

			{/* Confirmation modal */}
			<Dialog open={showModal} onOpenChange={setShowModal}>
				<DialogContent className="rounded-3xl sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>{mode === "pay" ? t("confirm-pay") : t("confirm-send")}</DialogTitle>
					</DialogHeader>

					<div className="flex flex-col gap-4 py-2">
						<Badge
							variant="outline"
							className="w-fit gap-1.5 font-mono text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400"
						>
							<span className="size-1.5 rounded-full bg-amber-500 shrink-0" />
							{network?.name ?? "Unknown"} — {selectedChainId}
						</Badge>

						<div className="flex flex-col gap-0.5">
							<p className="text-xs text-muted-foreground">{t("destination")}</p>
							{resolvedUsername && (
								<p className="text-xs text-muted-foreground">@{resolvedUsername}</p>
							)}
							<p className="font-mono text-sm break-all">{effectiveTo}</p>
						</div>

						{/* Full breakdown in modal */}
						{breakdown && (
							<div className="rounded-2xl border bg-muted/40 px-4 py-2 flex flex-col divide-y divide-border/60">
								<BreakdownRow label={t("you-send")} value={breakdown.grossAmount} symbol={token.symbol} highlight />
								<BreakdownRow label={`${t("fee")} (${(breakdown.feeBps / 100).toFixed(2)}%)`} value={breakdown.feeAmount} symbol={token.symbol} muted />
								<BreakdownRow label={t("recipient-gets")} value={breakdown.netAmount} symbol={token.symbol} highlight />
							</div>
						)}

					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => setShowModal(false)} className="flex-1 rounded-2xl">
							{t("cancel")}
						</Button>
						<Button
							onClick={handleConfirm}
							className="flex-1 rounded-2xl"
						>
							{t("confirm-send")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}
