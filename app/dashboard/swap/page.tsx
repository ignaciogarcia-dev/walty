"use client"
import { useWalletContext } from "@/components/wallet/context"
import { SwapForm } from "@/components/wallet/SwapForm"

export default function SwapPage() {
	const { address, password } = useWalletContext()

	function handleTxRecord(hash: string, to: string, amount: string) {
		fetch("/api/tx", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				fromAddress: address,
				toAddress: to,
				amount,
				txHash: hash,
			}),
		}).catch(() => {})
	}

	if (!address || !password) return null

	return (
		<div className="mx-auto max-w-2xl px-4 py-10">
			<SwapForm address={address} password={password} onTxRecord={handleTxRecord} />
		</div>
	)
}
