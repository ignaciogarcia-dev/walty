"use client"
import { useWalletContext } from "@/components/wallet/context"
import { SendForm } from "@/components/wallet/SendForm"
import { usePortfolio } from "@/hooks/usePortfolio"

const POLYGON_CHAIN_ID = 137

export default function PayPage() {
	const { address, executeRelayTransfer, relayTxStatus, relayTxHash, relayTxError, resetRelayTx } = useWalletContext()
	const { positions } = usePortfolio(address)

	return (
		<div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">
			<SendForm
				positions={positions}
				onSend={(token, to, amount, chainId) => executeRelayTransfer({ token, to, grossAmount: amount, chainId })}
				txStatus={relayTxStatus}
				txHash={relayTxHash}
				txError={relayTxError}
				onResetTx={resetRelayTx}
				selectedChainId={POLYGON_CHAIN_ID}
				onChainChange={() => {}}
				mode="pay"
				showChainSelector={false}
				networkSubtitle="Polygon · USDC"
			/>
		</div>
	)
}
