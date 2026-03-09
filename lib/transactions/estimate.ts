import { formatEther, parseUnits, isAddress } from "viem"
import { getAdapter } from "@/lib/chainAdapters/adapterRegistry"
import { getNetwork } from "@/lib/networks/networks"
import { getPublicClient } from "@/lib/rpc/getPublicClient"
import type { Token } from "@/lib/tokens/tokenRegistry"

export async function estimateTokenGasCost(
  token: Token,
  to: string,
  amount: string,
  from: string,
  chainId: number
): Promise<string> {
  if (!from || !isAddress(to) || Number(amount) <= 0) {
    throw new Error("Invalid parameters")
  }

  const adapter = getAdapter(chainId)
  const publicClient = getPublicClient(chainId)

  const gas = await adapter.estimateGas({
    from,
    to,
    token,
    amount,
    value: token.type === "native" ? parseUnits(amount, token.decimals) : undefined,
  })

  const gasPrice = await publicClient.getGasPrice()
  const network = getNetwork(chainId)

  const costEth = formatEther(gas * gasPrice)
  return costEth
}
