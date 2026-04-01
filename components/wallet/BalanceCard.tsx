"use client"
import { useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { usePortfolio } from "@/hooks/usePortfolio"
import { copyToClipboard } from "@/utils/copyToClipboard"

function truncateAddress(address: string): string {
	return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function BalanceCard({
	address,
}: {
	address: string | null
}) {
	const { totalUsd, loading } = usePortfolio(address)
	const [copied, setCopied] = useState(false)
	const [tooltipOpen, setTooltipOpen] = useState(false)

	async function handleCopyAddress() {
		if (!address) return
		await copyToClipboard(address)
		setCopied(true)
		setTooltipOpen(true)
		setTimeout(() => {
			setCopied(false)
			setTooltipOpen(false)
		}, 1500)
	}

	return (
		<div
			className="relative w-full overflow-hidden rounded-2xl border border-wallet-balance-border p-6 transition-transform duration-200"
			style={{
				background:
					"linear-gradient(135deg, var(--wallet-balance-gradient-start) 0%, var(--wallet-balance-gradient-middle) 55%, var(--wallet-balance-gradient-end) 100%)",
				minHeight: "180px",
			}}
		>
			{/* Top row */}
			<div className="flex items-start justify-between mb-8">
				<span className="text-wallet-balance-label text-sm font-semibold tracking-widest uppercase">
					Walty
				</span>
				<span className="text-wallet-balance-meta text-xs font-medium tracking-widest uppercase">
					POL
				</span>
			</div>

			{/* Balance */}
			<div className="flex min-h-10 items-center gap-3" aria-busy={loading}>
				{loading ? (
					<Skeleton
						className="h-10 w-44 max-w-[min(85vw,12rem)] rounded-lg border-0 bg-white/20 shadow-none"
						aria-hidden
					/>
				) : (
					<p className="text-wallet-balance-foreground text-4xl font-bold tabular-nums tracking-tight">
						${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
					</p>
				)}
			</div>

			{/* Address — bottom right */}
			{address && (
				<Tooltip open={tooltipOpen || undefined} onOpenChange={setTooltipOpen}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleCopyAddress}
							className="absolute right-6 bottom-6 cursor-pointer text-wallet-balance-meta text-xs font-mono tracking-wider transition-opacity hover:opacity-80"
						>
							{truncateAddress(address)}
						</button>
					</TooltipTrigger>
					<TooltipContent side="top">
						{copied ? "Copied" : "Copy"}
					</TooltipContent>
				</Tooltip>
			)}
		</div>
	)
}
