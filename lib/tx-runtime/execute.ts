import { simulateTransaction } from "@/lib/transactions/simulate"
import { buildBaseTx } from "@/lib/transactions/build"
import { prepareTx } from "@/lib/transactions/prepare"
import { broadcastSignedTx } from "@/lib/transactions/send"
import type { Token } from "@/lib/tokens/tokenRegistry"
import type { Signer } from "@/lib/signing/types"

/**
 * Full transaction orchestration: simulate → build → prepare → sign → broadcast.
 * This is the single entry point for executing a token transfer end-to-end.
 */
export async function executeTransfer(params: {
  token: Token
  to: string
  amount: string
  chainId: number
  from: string
  signer: Signer
}): Promise<string> {
  // 1. Simulate — mandatory safety check
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

  // 2. Build (pure) → Prepare (network) → Sign → Broadcast
  const base = buildBaseTx({
    token: params.token,
    to: params.to,
    amount: params.amount,
    chainId: params.chainId,
  })

  const unsigned = await prepareTx(base, params.from)
  const signed = await params.signer.signTransaction(unsigned)

  return broadcastSignedTx(signed, params.chainId)
}
