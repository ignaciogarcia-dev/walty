import { getNetwork, ChainType } from "@/lib/networks/networks"
import { createEvmAdapter } from "./evm/evmAdapter"
import type { ChainAdapter } from "./types"

export function getAdapter(chainId: number): ChainAdapter {
  const network = getNetwork(chainId)
  switch (network.chainType) {
    case ChainType.EVM:
      return createEvmAdapter(chainId)
    default:
      throw new Error(`Unsupported chainType: ${network.chainType}`)
  }
}
