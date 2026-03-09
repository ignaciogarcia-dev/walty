export enum ChainType {
  EVM = "EVM",
  BITCOIN = "BITCOIN",
  SOLANA = "SOLANA",
  COSMOS = "COSMOS",
}

export type Network = {
  id: number
  name: string
  chainType: ChainType
  nativeCurrency: { symbol: string; decimals: number }
  rpc: string[]
  explorer: string
  zeroxBaseUrl: string
  multicall?: `0x${string}`
  icon: string
}

export const NETWORKS: Network[] = [
  {
    id: 1,
    name: "Ethereum",
    chainType: ChainType.EVM,
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpc: [],
    explorer: "https://etherscan.io",
    zeroxBaseUrl: "https://api.0x.org",
    icon: "EthereumLogo",
  },
  {
    id: 42161,
    name: "Arbitrum",
    chainType: ChainType.EVM,
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpc: [],
    explorer: "https://arbiscan.io",
    zeroxBaseUrl: "https://arbitrum.api.0x.org",
    icon: "ArbitrumLogo",
  },
  {
    id: 8453,
    name: "Base",
    chainType: ChainType.EVM,
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpc: [],
    explorer: "https://basescan.org",
    zeroxBaseUrl: "https://base.api.0x.org",
    icon: "BaseLogo",
  },
  {
    id: 10,
    name: "Optimism",
    chainType: ChainType.EVM,
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpc: [],
    explorer: "https://optimistic.etherscan.io",
    zeroxBaseUrl: "https://optimism.api.0x.org",
    icon: "OptimismLogo",
  },
  {
    id: 137,
    name: "Polygon",
    chainType: ChainType.EVM,
    nativeCurrency: { symbol: "MATIC", decimals: 18 },
    rpc: [],
    explorer: "https://polygonscan.com",
    zeroxBaseUrl: "https://polygon.api.0x.org",
    icon: "PolygonLogo",
  },
]

const networkMap = new Map<number, Network>(NETWORKS.map((n) => [n.id, n]))

export function getNetwork(chainId: number): Network {
  const network = networkMap.get(chainId)
  if (!network) throw new Error(`Unsupported chainId: ${chainId}`)
  return network
}

export function getEVMNetworks(): Network[] {
  return NETWORKS.filter((n) => n.chainType === ChainType.EVM)
}
