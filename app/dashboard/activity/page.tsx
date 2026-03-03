"use client"
import { useWalletContext } from "@/components/wallet/context"
import { TxHistory } from "@/components/wallet/TxHistory"

export default function ActivityPage() {
	const { txHistory } = useWalletContext()

	return (
		<div className="mx-auto max-w-2xl px-4 py-10 flex flex-col gap-6">
			<TxHistory txHistory={txHistory} />
		</div>
	)
}
