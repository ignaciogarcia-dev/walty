"use client"
import { useWalletContext } from "@/components/wallet/context"
import { BalanceCard } from "@/components/wallet/BalanceCard"
import { PortfolioCard } from "@/components/wallet/PortfolioCard"

export default function HomePage() {
	const { address, balance } = useWalletContext()

	return (
		<div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">
			<BalanceCard address={address} balance={balance} />
			<PortfolioCard address={address} />
		</div>
	)
}
