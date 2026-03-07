"use client"
import { useWalletContext } from "@/components/wallet/context"
import { SendForm } from "@/components/wallet/SendForm"
import { usePortfolio } from "@/hooks/usePortfolio"

export default function SendPage() {
	const { address, sendToken, estimateTokenGasCost, txStatus, txHash, txError, resetTx } = useWalletContext()
	const { positions } = usePortfolio(address)

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
			/>
		</div>
	)
}
