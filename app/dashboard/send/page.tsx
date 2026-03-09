"use client"
import { useState, useEffect } from "react"
import { useWalletContext } from "@/components/wallet/context"
import { SendForm } from "@/components/wallet/SendForm"
import { usePortfolio } from "@/hooks/usePortfolio"

const CHAIN_SESSION_KEY = "walty-send-chain"

export default function SendPage() {
	const { address, sendToken, estimateTokenGasCost, txStatus, txHash, txError, resetTx } = useWalletContext()
	const { positions } = usePortfolio(address)

	const [selectedChainId, setSelectedChainId] = useState<number>(() => {
		if (typeof window !== "undefined") {
			const stored = sessionStorage.getItem(CHAIN_SESSION_KEY)
			if (stored) return Number(stored)
		}
		return 1
	})

	useEffect(() => {
		sessionStorage.setItem(CHAIN_SESSION_KEY, String(selectedChainId))
	}, [selectedChainId])

	return (
		<div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">
			<SendForm
				positions={positions}
				onEstimateGas={estimateTokenGasCost}
				onSend={sendToken}
				txStatus={txStatus}
				txHash={txHash}
				txError={txError}
				onResetTx={resetTx}
				selectedChainId={selectedChainId}
				onChainChange={setSelectedChainId}
			/>
		</div>
	)
}
