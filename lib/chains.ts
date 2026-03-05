export type SupportedChain = {
  id: number
  name: string
  nativeCurrency: { symbol: string; decimals: number }
  rpcUrls: string[]
  explorer: string
  zeroxBaseUrl: string
}

export const SUPPORTED_CHAINS: SupportedChain[] = [
  {
    id: 1,
    name: "Ethereum",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://rpc.ankr.com/eth", "https://ethereum.publicnode.com"],
    explorer: "https://etherscan.io",
    zeroxBaseUrl: "https://api.0x.org",
  },
  {
    id: 42161,
    name: "Arbitrum",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://arb1.arbitrum.io/rpc", "https://rpc.ankr.com/arbitrum"],
    explorer: "https://arbiscan.io",
    zeroxBaseUrl: "https://arbitrum.api.0x.org",
  },
  {
    id: 8453,
    name: "Base",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://mainnet.base.org", "https://rpc.ankr.com/base"],
    explorer: "https://basescan.org",
    zeroxBaseUrl: "https://base.api.0x.org",
  },
  {
    id: 10,
    name: "Optimism",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://mainnet.optimism.io", "https://rpc.ankr.com/optimism"],
    explorer: "https://optimistic.etherscan.io",
    zeroxBaseUrl: "https://optimism.api.0x.org",
  },
  {
    id: 137,
    name: "Polygon",
    nativeCurrency: { symbol: "MATIC", decimals: 18 },
    rpcUrls: ["https://polygon-rpc.com", "https://rpc.ankr.com/polygon"],
    explorer: "https://polygonscan.com",
    zeroxBaseUrl: "https://polygon.api.0x.org",
  },
]

export const DEFAULT_CHAIN = SUPPORTED_CHAINS[0]

export function getChainById(id: number): SupportedChain | undefined {
  return SUPPORTED_CHAINS.find((c) => c.id === id)
}
