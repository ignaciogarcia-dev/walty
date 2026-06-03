import { type Chain } from "viem"
import { mainnet, arbitrum, base, optimism, polygon, polygonAmoy } from "viem/chains"

export const VIEM_CHAINS: Record<number, Chain> = {
  1: mainnet,
  42161: arbitrum,
  8453: base,
  10: optimism,
  137: polygon,
  80002: polygonAmoy,
}

export function getViemChain(chainId: number): Chain {
  const chain = VIEM_CHAINS[chainId]
  if (!chain) throw new Error(`No viem chain for chainId: ${chainId}`)
  return chain
}
