"use client"
import { useEffect, useState } from "react"
import { useWalletContext } from "@/components/wallet/context"
import { ActivePaymentRequestCard } from "@/components/dashboard/ActivePaymentRequestCard"
import { BalanceCard } from "@/components/wallet/BalanceCard"
import { TokenCard } from "@/components/wallet/TokenCard"
import { usePortfolio } from "@/hooks/usePortfolio"
import { PAYMENT_HOME_POLL_INTERVAL_MS } from "@/lib/payments/config"
import type { PaymentRequestView } from "@/lib/payments/types"
import { isPaymentRequestActive } from "@/lib/payments/types"
import { PaperPlaneTilt, QrCode } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { CollectModal } from "@/components/pos/CollectModal"

export function BusinessHome() {
	const { address, balance } = useWalletContext()
	const { positions, loading } = usePortfolio(address)
	const router = useRouter()
	const [collectOpen, setCollectOpen] = useState(false)
	const [activeRequest, setActiveRequest] = useState<PaymentRequestView | null>(null)

	const quickActionClassName =
		"flex-1 rounded-2xl border border-quick-action-border bg-quick-action-surface text-quick-action-foreground backdrop-blur-md transition-all hover:border-quick-action-hover-border hover:bg-quick-action-hover"

	useEffect(() => {
		let cancelled = false

		const loadActiveRequest = async () => {
			try {
				const res = await fetch("/api/payment-requests")
				if (!res.ok) {
					if (!cancelled) {
						setActiveRequest(null)
					}
					return
				}

				const data = await res.json() as { request: PaymentRequestView | null }
				if (cancelled) return

				if (data.request && isPaymentRequestActive(data.request)) {
					setActiveRequest(data.request)
				} else {
					setActiveRequest(null)
				}
			} catch {
				if (!cancelled) {
					setActiveRequest(null)
				}
			}
		}

		loadActiveRequest()
		const id = setInterval(loadActiveRequest, PAYMENT_HOME_POLL_INTERVAL_MS)

		return () => {
			cancelled = true
			clearInterval(id)
		}
	}, [])

	function handleRequestChange(request: PaymentRequestView | null) {
		if (request && isPaymentRequestActive(request)) {
			setActiveRequest(request)
			return
		}

		setActiveRequest(null)
	}

	const tokensWithBalance = positions.filter((p) => parseFloat(p.balance) > 0)
	const tokensToShow = tokensWithBalance.length > 0
		? tokensWithBalance
		: positions.filter((p) => {
			const popularSymbols = ["ETH", "USDC", "USDT", "DAI", "WETH", "WBTC"]
			return popularSymbols.includes(p.token.symbol)
		})

	return (
		<div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">
			<BalanceCard address={address} balance={balance} />

			<div className="flex gap-3">
				<Button onClick={() => setCollectOpen(true)} variant="ghost" className={quickActionClassName} size="lg">
					<QrCode className="mr-2 h-4 w-4" />
					Cobrar
				</Button>
				<Button onClick={() => router.push("/dashboard/send")} variant="ghost" className={quickActionClassName} size="lg">
					<PaperPlaneTilt className="mr-2 h-4 w-4" />
					Transferir
				</Button>
			</div>

			<CollectModal
				open={collectOpen}
				onOpenChange={setCollectOpen}
				merchantWalletAddress={address}
				activeRequest={activeRequest}
				onRequestChange={handleRequestChange}
			/>

			{activeRequest && (
				<ActivePaymentRequestCard
					request={activeRequest}
					onOpenQr={() => setCollectOpen(true)}
					onCancel={() => setActiveRequest(null)}
				/>
			)}

			{loading ? (
				<div className="text-sm text-muted-foreground text-center py-4">
					Loading tokens...
				</div>
			) : tokensToShow.length > 0 ? (
				<div className="grid grid-cols-1 gap-4">
					{tokensToShow.map((position) => (
						<TokenCard key={`${position.chainId}-${position.token.symbol}`} position={position} />
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
