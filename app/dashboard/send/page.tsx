"use client"
import { useWalletContext } from "@/components/wallet/context"
import { BalanceCard } from "@/components/wallet/BalanceCard"
import { SendForm } from "@/components/wallet/SendForm"

export default function SendPage() {
	const { address, balance, estimateGasCost, send, txStatus, txHash, txError, resetTx } = useWalletContext()

	return (
		<div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">
			<BalanceCard address={address} balance={balance} />
			<SendForm
				onEstimateGas={estimateGasCost}
				onSend={send}
				txStatus={txStatus}
				txHash={txHash}
				txError={txError}
				onResetTx={resetTx}
			/>
		</div>
	)
}
