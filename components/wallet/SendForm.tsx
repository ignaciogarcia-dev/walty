"use client"
import { useEffect, useRef, useState } from "react"
import { isAddress } from "viem"
import { ArrowLeft } from "@phosphor-icons/react"
import type { TxStatus } from "@/hooks/useWallet"
import type { TokenPosition } from "@/hooks/usePortfolio"
import type { Token } from "@/lib/tokens"
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
import { TokenAvatar } from "./TokenAvatar"
import { useTranslation } from "@/hooks/useTranslation"

function TokenSelectList({
	positions,
	onSelect,
	search,
}: {
	positions: TokenPosition[]
	onSelect: (position: TokenPosition) => void
	search: string
}) {
	const { t } = useTranslation()

	// Filter positions based on search query
	const filteredPositions = positions.filter((position) => {
		if (!search.trim()) return true

		const searchLower = search.toLowerCase().trim()
		const symbolMatch = position.token.symbol.toLowerCase().includes(searchLower)
		const nameMatch = position.token.name.toLowerCase().includes(searchLower)
		const addressMatch = position.token.address?.toLowerCase().includes(searchLower) ?? false

		return symbolMatch || nameMatch || addressMatch
	})

	if (positions.length === 0) {
		return (
			<p className="text-sm text-muted-foreground text-center py-8">
				{t("loading")}
			</p>
		)
	}

	if (filteredPositions.length === 0) {
		return (
			<p className="text-sm text-muted-foreground text-center py-8">
				No tokens found
			</p>
		)
	}

	return (
		<div className="flex flex-col gap-1">
			{filteredPositions.map((position) => (
				<button
					key={position.token.symbol}
					onClick={() => onSelect(position)}
					className="flex items-center gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-accent"
				>
					<TokenAvatar
						symbol={position.token.symbol}
						imageUrl={position.imageUrl}
						sizeClass="size-9"
						fallbackChars={4}
					/>
					<div>
						<p className="font-medium text-sm">{position.token.symbol}</p>
						<p className="text-xs text-muted-foreground">{position.token.name}</p>
					</div>
					<div className="ml-auto text-right">
						<p className="text-sm font-mono">
							{parseFloat(position.balance).toFixed(4)}
						</p>
					</div>
				</button>
			))}
		</div>
	)
}

export function SendForm({
	positions,
	onEstimateGas,
	onSend,
	txStatus,
	txHash,
	txError,
	onResetTx,
}: {
	positions: TokenPosition[]
	onEstimateGas: (token: Token, to: string, amount: string) => Promise<string>
	onSend: (token: Token, to: string, amount: string) => Promise<void>
	txStatus: TxStatus
	txHash: string | null
	txError: string | null
	onResetTx: () => void
}) {
	const { t } = useTranslation()
	const [selectedPosition, setSelectedPosition] = useState<TokenPosition | null>(null)
	const [search, setSearch] = useState("")
	const [to, setTo] = useState("")
	const [amount, setAmount] = useState("")
	const [showModal, setShowModal] = useState(false)
	const [gasEstimate, setGasEstimate] = useState<string | null>(null)
	const [gasError, setGasError] = useState<string | null>(null)

	// Username resolution state
	const [usernameResolving, setUsernameResolving] = useState(false)
	const [resolvedAddress, setResolvedAddress] = useState<`0x${string}` | null>(null)
	const [resolvedUsername, setResolvedUsername] = useState<string | null>(null)
	const [usernameError, setUsernameError] = useState<string | null>(null)
	const resolveDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		setResolvedAddress(null)
		setUsernameError(null)
		setResolvedUsername(null)
		setUsernameResolving(false)

		if (!to.startsWith("@")) return
		const username = to.slice(1).trim()
		if (!username) return

		if (resolveDebounce.current) clearTimeout(resolveDebounce.current)
		setUsernameResolving(true)

		resolveDebounce.current = setTimeout(async () => {
			try {
				const res = await fetch(`/api/username/resolve?username=${encodeURIComponent(username)}`)
				if (res.ok) {
					const { address } = await res.json()
					setResolvedAddress(address)
					setResolvedUsername(username)
				} else {
					setUsernameError(t("username-not-found"))
				}
			} catch {
				setUsernameError(t("username-not-found"))
			} finally {
				setUsernameResolving(false)
			}
		}, 600)

		return () => {
			if (resolveDebounce.current) clearTimeout(resolveDebounce.current)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [to])

	useEffect(() => {
		if (txStatus === "confirmed") {
			setTo("")
			setAmount("")
			setSearch("")
			setResolvedAddress(null)
			setResolvedUsername(null)
			setSelectedPosition(null)
		}
	}, [txStatus])

	const effectiveTo: string | null = resolvedAddress ?? (isAddress(to) ? to : null)

	async function handleOpenModal() {
		if (!effectiveTo || !amount || !selectedPosition) return
		setGasEstimate(null)
		setGasError(null)
		setShowModal(true)
		try {
			const estimate = await onEstimateGas(selectedPosition.token, effectiveTo, amount)
			setGasEstimate(estimate)
		} catch {
			setGasError(t("could-not-estimate-gas"))
		}
	}

	async function handleConfirm() {
		if (!effectiveTo || !selectedPosition) return
		setShowModal(false)
		await onSend(selectedPosition.token, effectiveTo, amount)
	}

	function handleBack() {
		setSelectedPosition(null)
		setSearch("")
		setTo("")
		setAmount("")
		setResolvedAddress(null)
		setResolvedUsername(null)
		setUsernameError(null)
		onResetTx()
	}

	const isBusy = txStatus === "pending" || txStatus === "pending_on_chain"
	const canSubmit = !isBusy && !!effectiveTo && !!amount && !usernameResolving && !usernameError

	// Step 1 — token selection
	if (!selectedPosition) {
		return (
			<div className="rounded-4xl border bg-card p-6 flex flex-col gap-4">
				<h2 className="font-semibold text-foreground">{t("select-token")}</h2>
				<Input
					type="text"
					placeholder="Token name or contract address"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="rounded-2xl"
				/>
				<TokenSelectList positions={positions} onSelect={setSelectedPosition} search={search} />
			</div>
		)
	}

	const { token, balance, imageUrl } = selectedPosition

	// Step 2 — send form
	return (
		<>
			<div className="rounded-4xl border bg-card p-6 flex flex-col gap-4">
				<div className="flex items-center gap-2">
					<button
						onClick={handleBack}
						className="rounded-full p-1.5 transition-colors hover:bg-accent"
						aria-label="Back"
					>
						<ArrowLeft className="size-4" />
					</button>
					<TokenAvatar symbol={token.symbol} imageUrl={imageUrl} />
					<h2 className="font-semibold text-foreground">
						{t("send")} {token.symbol}
					</h2>
					<Badge variant="outline" className="ml-auto font-mono text-xs">
						{parseFloat(balance).toFixed(4)} {token.symbol}
					</Badge>
				</div>

				<div className="flex flex-col gap-1.5">
					<Label htmlFor="tx-to">{t("recipient")}</Label>
					<Input
						id="tx-to"
						type="text"
						placeholder={t("username-or-address")}
						value={to}
						onChange={(e) => setTo(e.target.value)}
						className="rounded-2xl"
					/>
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

				<div className="flex flex-col gap-1.5">
					<Label htmlFor="tx-amount">
						{t("amount")} ({token.symbol})
					</Label>
					<Input
						id="tx-amount"
						type="text"
						placeholder="0.00"
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
						className="rounded-2xl"
					/>
				</div>

				<Button onClick={handleOpenModal} disabled={!canSubmit} className="w-full rounded-2xl">
					{isBusy ? (
						<>
							<Spinner />
							{t("sending")}
						</>
					) : (
						`${t("send")} ${token.symbol}`
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
				<DialogContent className="rounded-3xl sm:max-w-sm">
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
							{resolvedUsername && (
								<p className="text-xs text-muted-foreground">@{resolvedUsername}</p>
							)}
							<p className="font-mono text-sm break-all">{effectiveTo}</p>
						</div>

						<div className="flex flex-col gap-0.5">
							<p className="text-xs text-muted-foreground">{t("amount")}</p>
							<p className="font-mono font-semibold">
								{amount} {token.symbol}
							</p>
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
						<Button variant="outline" onClick={() => setShowModal(false)} className="flex-1 rounded-2xl">
							{t("cancel")}
						</Button>
						<Button
							onClick={handleConfirm}
							disabled={gasEstimate === null && !gasError}
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
