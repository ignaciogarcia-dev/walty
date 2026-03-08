"use client"
import { Spinner } from "@/components/ui/spinner"
import { usePortfolio } from "@/hooks/usePortfolio"

function truncateAddress(address: string): string {
	return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function BalanceCard({
	address,
	balance,
}: {
	address: string | null
	balance: string | null
}) {
	const { totalUsd, loading } = usePortfolio(address)

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
					ETH
				</span>
			</div>

			{/* Balance */}
			<div className="flex items-center gap-3">
				{loading ? (
					<Spinner className="text-wallet-balance-spinner size-5" />
				) : (
					<p className="text-wallet-balance-foreground text-4xl font-bold tabular-nums tracking-tight">
						${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
					</p>
				)}
			</div>

			{/* Address — bottom right */}
			{address && (
				<p className="text-wallet-balance-meta absolute right-6 bottom-6 text-xs font-mono tracking-wider">
					{truncateAddress(address)}
				</p>
			)}
		</div>
	)
}
