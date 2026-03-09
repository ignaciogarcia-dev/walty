import { getAdapter } from "@/lib/chainAdapters/adapterRegistry"
import { simulateTransaction } from "./simulate"
import type { Token } from "@/lib/tokens/tokenRegistry"

export async function sendToken(params: {
  token: Token
  to: string
  amount: string
  chainId: number
  from: string
  mnemonic: string
}): Promise<string> {
  // Simulate before sending — mandatory safety check
  const simulation = await simulateTransaction({
    chainId: params.chainId,
    from: params.from,
    to: params.to,
    token: params.token,
    amount: params.amount,
  })

  if (!simulation.success) {
    throw new Error(simulation.error ?? "Transaction simulation failed")
  }

  return getAdapter(params.chainId).sendTransaction({
    mnemonic: params.mnemonic,
    chainId: params.chainId,
    from: params.from,
    to: params.to,
    token: params.token,
    amount: params.amount,
  })
}
