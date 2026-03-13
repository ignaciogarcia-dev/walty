"use client"
import { useState, useEffect, Suspense } from "react"
import { useWalletContext } from "@/components/wallet/context"
import { SendForm } from "@/components/wallet/SendForm"
import { usePortfolio } from "@/hooks/usePortfolio"
import { useSearchParams } from "next/navigation"

const CHAIN_SESSION_KEY = "walty-send-chain"

function SendPageInner() {
	const { address, sendToken, estimateTokenGasCost, txStatus, txHash, txError, resetTx } = useWalletContext()
	const { positions } = usePortfolio(address)
	const searchParams = useSearchParams()

	const chainIdParam = searchParams.get("chainId")
	const allowedTokensParam = searchParams.get("allowedTokens")
	const allowedTokens = allowedTokensParam ? allowedTokensParam.split(",") : null

	const [selectedChainId, setSelectedChainId] = useState<number>(() => {
		if (chainIdParam) return Number(chainIdParam)
		if (typeof window !== "undefined") {
			const stored = sessionStorage.getItem(CHAIN_SESSION_KEY)
			if (stored) return Number(stored)
		}
		return 1
	})

	useEffect(() => {
		if (!chainIdParam) {
			sessionStorage.setItem(CHAIN_SESSION_KEY, String(selectedChainId))
		}
	}, [selectedChainId, chainIdParam])

	// Filter positions when allowedTokens is set
	const filteredPositions = allowedTokens
		? positions.filter((p) => allowedTokens.includes(p.token.symbol))
		: positions

	return (
		<div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">
			<SendForm
				positions={filteredPositions}
				onEstimateGas={estimateTokenGasCost}
				onSend={sendToken}
				txStatus={txStatus}
				txHash={txHash}
				txError={txError}
				onResetTx={resetTx}
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
