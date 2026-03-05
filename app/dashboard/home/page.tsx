"use client"
import { useWalletContext } from "@/components/wallet/context"
import { BalanceCard } from "@/components/wallet/BalanceCard"
import { TokenCard } from "@/components/wallet/TokenCard"
import { usePortfolio } from "@/hooks/usePortfolio"

export default function HomePage() {
	const { address, balance } = useWalletContext()
	const { positions, loading } = usePortfolio(address)

	// Filter tokens with balance > 0
	const tokensWithBalance = positions.filter((p) => parseFloat(p.balance) > 0)

	return (
		<div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">
			<BalanceCard address={address} balance={balance} />
			
			{loading ? (
				<div className="text-sm text-muted-foreground text-center py-4">
					Loading tokens...
				</div>
			) : tokensWithBalance.length > 0 ? (
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					{tokensWithBalance.map((position) => (
						<TokenCard key={position.token.symbol} position={position} />
					))}
				</div>
			) : (
				<div className="text-sm text-muted-foreground text-center py-4">
					No tokens found
				</div>
			)}
		</div>
	)
}
