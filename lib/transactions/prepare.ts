import { erc20Abi } from "viem"
import { getPublicClient } from "@/lib/rpc/getPublicClient"
import type { UnsignedTx } from "@/lib/signing/types"
import type { BaseTx } from "./build"

export type TokenMeta = {
  address: `0x${string}`
  decimals: number
  amount: bigint
}

/**
 * Takes a pure BaseTx and resolves network-dependent fields:
 * gas estimation, EIP-1559 fees, and balance sufficiency check.
 *
 * For ERC-20 transfers, pass `tokenMeta` to enable token balance verification.
 */
export async function prepareTx(
  base: BaseTx,
  from: string,
  tokenMeta?: TokenMeta
): Promise<UnsignedTx> {
  const publicClient = getPublicClient(base.chainId)
  const fromAddr = from as `0x${string}`

  // Explicit pending nonce — walletClient.signTransaction was resolving nonce 0 in some
  // fallback-RPC setups while estimateGas used a different view, causing "nonce too low".
  const nonceBig = await publicClient.getTransactionCount({
    address: fromAddr,
    blockTag: "pending",
  })
  const nonce = Number(nonceBig)

  const [gas, fees] = await Promise.all([
    publicClient.estimateGas({
      account: fromAddr,
      to: base.to,
      data: base.data,
      value: base.value,
      nonce,
    }),
    publicClient.estimateFeesPerGas(),
  ])

  const maxGasCost = gas * fees.maxFeePerGas!

  if (!base.data) {
    // Native transfer: verify balance covers value + gas
    const balance = await publicClient.getBalance({
      address: fromAddr,
    })
    if (balance < base.value + maxGasCost) {
      throw new Error("Insufficient funds (including gas)")
    }
  } else if (tokenMeta) {
    // ERC-20 transfer: verify token balance + native balance for gas
    const [tokenBalance, nativeBalance] = await Promise.all([
      publicClient.readContract({
        address: tokenMeta.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [fromAddr],
      }),
      publicClient.getBalance({ address: fromAddr }),
    ])

    if (tokenBalance < tokenMeta.amount) {
      throw new Error("Insufficient token balance")
    }
    if (nativeBalance < maxGasCost) {
      throw new Error("Insufficient funds for gas")
    }
  }

  return {
    to: base.to,
    data: base.data,
    value: base.value,
    chainId: base.chainId,
    nonce,
    gas,
    maxFeePerGas: fees.maxFeePerGas!,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas!,
  }
}
