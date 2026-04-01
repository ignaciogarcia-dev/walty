"use client"
import { useState, useEffect, useRef, startTransition, Suspense } from "react"
import { useWalletContext } from "@/components/wallet/context"
import { SendForm } from "@/components/wallet/SendForm"
import { usePortfolio } from "@/hooks/usePortfolio"
import { useSearchParams } from "next/navigation"
import { NETWORKS } from "@/lib/networks/networks"

const CHAIN_SESSION_KEY = "walty-send-chain"

function SendPageInner() {
	const { address, executeRelayTransfer, relayTxStatus, relayTxHash, relayTxError, resetRelayTx } = useWalletContext()
	const { positions, loading: portfolioLoading } = usePortfolio(address)
	const searchParams = useSearchParams()

	const chainIdParam = searchParams.get("chainId")

	const [selectedChainId, setSelectedChainId] = useState<number>(() => {
		if (chainIdParam) return Number(chainIdParam)
		if (typeof window !== "undefined") {
			const stored = sessionStorage.getItem(CHAIN_SESSION_KEY)
			if (stored) return Number(stored)
		}
		return NETWORKS[0]?.id ?? 1
	})

	const hasAutoSelectedChain = useRef(false)
	const usdcPositions = positions.filter((p) => p.token.symbol === "USDC")

	useEffect(() => {
		if (chainIdParam) return
		if (hasAutoSelectedChain.current) return
		if (portfolioLoading || positions.length === 0) return

		const chainWithBalance = NETWORKS.find((net) =>
			usdcPositions.some(
				(p) => p.chainId === net.id && parseFloat(p.balance) > 0,
			),
		)

		if (chainWithBalance) {
			hasAutoSelectedChain.current = true
			startTransition(() => setSelectedChainId(chainWithBalance.id))
		}
	}, [portfolioLoading, usdcPositions, chainIdParam, positions.length])

	useEffect(() => {
		if (!chainIdParam) {
			sessionStorage.setItem(CHAIN_SESSION_KEY, String(selectedChainId))
		}
	}, [selectedChainId, chainIdParam])

	return (
		<div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">
			<SendForm
				positions={positions}
				onSend={(token, to, amount, chainId) => executeRelayTransfer({ token, to, grossAmount: amount, chainId })}
				txStatus={relayTxStatus}
				txHash={relayTxHash}
				txError={relayTxError}
				onResetTx={resetRelayTx}
				selectedChainId={selectedChainId}
				onChainChange={chainIdParam ? () => {} : setSelectedChainId}
				mode="transfer"
			/>
		</div>
	)
}

export default function SendPage() {
	return (
		<Suspense>
			<SendPageInner />
		</Suspense>
	)
}
