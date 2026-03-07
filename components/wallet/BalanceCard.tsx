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
			className="relative w-full rounded-2xl p-6 overflow-hidden transition-transform duration-200  border border-white/10"
			style={{
				background: "linear-gradient(135deg, #0f47d4 0%, #1a6bff 55%, #4da8ff 100%)",
				minHeight: "180px",
			}}
		>
			{/* Top row */}
			<div className="flex items-start justify-between mb-8">
				<span className="text-white/80 text-sm font-semibold tracking-widest uppercase">
					Walty
				</span>
				<span className="text-white/50 text-xs font-medium tracking-widest uppercase">
					ETH
				</span>
			</div>

			{/* Balance */}
			<div className="flex items-center gap-3">
				{loading ? (
					<Spinner className="size-5 text-white/40" />
				) : (
					<p className="text-4xl font-bold text-white tabular-nums tracking-tight">
						${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
					</p>
				)}
			</div>

			{/* Address — bottom right */}
			{address && (
				<p className="absolute bottom-6 right-6 text-white/50 text-xs font-mono tracking-wider">
					{truncateAddress(address)}
				</p>
			)}
		</div>
	)
}
