"use client"
import { useState } from "react"
import { useWalletContext } from "@/components/wallet/context"
import { SwapForm } from "@/components/wallet/SwapForm"
import { NETWORKS } from "@/lib/networks/networks"

export default function SwapPage() {
	const { address, password } = useWalletContext()
	const [chainId, setChainId] = useState(1)

	function handleTxRecord(hash: string, to: string, amount: string) {
		fetch("/api/tx", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				hash,
				chainId,
				chainType: "EVM",
				fromAddress: address,
				toAddress: to,
				tokenAddress: null,
				tokenSymbol: "SWAP",
				value: amount,
			}),
		}).catch(() => {})
	}

	if (!address || !password) return null

	return (
		<div className="mx-auto max-w-2xl px-4 py-10">
			{/* Chain tabs */}
			<div className="flex gap-1.5 overflow-x-auto pb-3 mb-1">
				{NETWORKS.map((net) => (
					<button
						key={net.id}
						onClick={() => setChainId(net.id)}
						className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
							chainId === net.id
								? "bg-foreground text-background"
								: "bg-muted text-muted-foreground hover:bg-accent"
						}`}
					>
						{net.name}
					</button>
				))}
			</div>
			<SwapForm address={address} password={password} chainId={chainId} onTxRecord={handleTxRecord} />
		</div>
	)
}
