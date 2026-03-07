"use client"
import { useWalletContext } from "@/components/wallet/context"
import { BalanceCard } from "@/components/wallet/BalanceCard"
import { TokenCard } from "@/components/wallet/TokenCard"
import { usePortfolio } from "@/hooks/usePortfolio"
import { ArrowsLeftRight, ArrowUpRight } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { useTranslation } from "@/hooks/useTranslation"

export default function HomePage() {
	const { address, balance } = useWalletContext()
	const { positions, loading } = usePortfolio(address)
	const router = useRouter()
	// Filter tokens with balance > 0
	const tokensWithBalance = positions.filter((p) => parseFloat(p.balance) > 0)

	// If no tokens with balance, show popular tokens with 0 balance
	const tokensToShow = tokensWithBalance.length > 0
		? tokensWithBalance
		: positions.filter((p) => {
			const popularSymbols = ["ETH", "USDC", "USDT", "DAI", "WETH", "WBTC"]
			return popularSymbols.includes(p.token.symbol)
		})

	const { t } = useTranslation()

	return (
		<div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">
			<BalanceCard address={address} balance={balance} />
			<div className="flex gap-3 mt-4">
				<Button onClick={() => router.push("/dashboard/send")} className="flex-1" size="lg"><ArrowUpRight className="mr-2 h-4 w-4" />
					{t("send")}</Button>
				<Button onClick={() => router.push("/dashboard/swap")} className="flex-1" size="lg" variant="outline"><ArrowsLeftRight className="mr-2 h-4 w-4" />
					{t("swap")}</Button>
			</div>
			{loading ? (
				<div className="text-sm text-muted-foreground text-center py-4">
					Loading tokens...
				</div>
			) : tokensToShow.length > 0 ? (
				<div className="grid grid-cols-1 gap-4">
					{tokensToShow.map((position) => (
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
