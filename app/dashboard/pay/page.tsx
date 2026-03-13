"use client"
import { useWalletContext } from "@/components/wallet/context"
import { SendForm } from "@/components/wallet/SendForm"
import { usePortfolio } from "@/hooks/usePortfolio"

const POLYGON_CHAIN_ID = 137
const PAY_TOKENS = ["USDC", "USDT"] as const
const tokenOrder = new Map<string, number>(PAY_TOKENS.map((symbol, index) => [symbol, index]))

export default function PayPage() {
	const { address, sendToken, estimateTokenGasCost, txStatus, txHash, txError, resetTx } = useWalletContext()
	const { positions } = usePortfolio(address)

	const payPositions = positions
		.filter((position) => position.chainId === POLYGON_CHAIN_ID && tokenOrder.has(position.token.symbol))
		.sort((a, b) => (tokenOrder.get(a.token.symbol) ?? 0) - (tokenOrder.get(b.token.symbol) ?? 0))

	return (
		<div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">
			<SendForm
				positions={payPositions}
				onEstimateGas={estimateTokenGasCost}
				onSend={sendToken}
				txStatus={txStatus}
				txHash={txHash}
				txError={txError}
				onResetTx={resetTx}
				selectedChainId={POLYGON_CHAIN_ID}
				onChainChange={() => {}}
				mode="pay"
				showChainSelector={false}
				showTokenSearch={false}
				networkSubtitle="Polygon"
			/>
		</div>
	)
}
