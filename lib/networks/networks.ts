export enum ChainType {
  EVM = "EVM",
}

export type Network = {
  id: number
  name: string
  chainType: ChainType
  nativeCurrency: { symbol: string; decimals: number }
  rpc: string[]
  explorer: string
  multicall?: `0x${string}`
  icon: string
}

// ---------------------------------------------------------------------------
// Full registry — source of truth for metadata (explorer, symbol, etc.)
// Used by getNetwork(), getTxUrl(), adapters, tx history display.
// ---------------------------------------------------------------------------

const NETWORK_REGISTRY: Network[] = [
  {
    id: 1,
    name: "Ethereum",
    chainType: ChainType.EVM,
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpc: [],
    explorer: "https://etherscan.io",
    icon: "EthereumLogo",
  },
  {
    id: 42161,
    name: "Arbitrum",
    chainType: ChainType.EVM,
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpc: [],
    explorer: "https://arbiscan.io",
    icon: "ArbitrumLogo",
  },
  {
    id: 8453,
    name: "Base",
    chainType: ChainType.EVM,
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpc: [],
    explorer: "https://basescan.org",
    icon: "BaseLogo",
  },
  {
    id: 10,
    name: "Optimism",
    chainType: ChainType.EVM,
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpc: [],
    explorer: "https://optimistic.etherscan.io",
    icon: "OptimismLogo",
  },
  {
    id: 137,
    name: "Polygon",
    chainType: ChainType.EVM,
    nativeCurrency: { symbol: "MATIC", decimals: 18 },
    rpc: [],
    explorer: "https://polygonscan.com",
    icon: "PolygonLogo",
  },
]

// ---------------------------------------------------------------------------
// Enabled networks — filtered by NEXT_PUBLIC_ENABLED_CHAINS env var.
// Controls what users can interact with: SendForm, ReceiveModal, portfolio.
// When unset, all networks are enabled.
// ---------------------------------------------------------------------------

const ENABLED_CHAIN_IDS: number[] | null = (() => {
  const raw = process.env.NEXT_PUBLIC_ENABLED_CHAINS
  if (!raw) return null

  const parsed = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n))

  const validIds = new Set(NETWORK_REGISTRY.map((n) => n.id))
  const invalid = parsed.filter((id) => !validIds.has(id))
  if (invalid.length) {
    throw new Error(
      `Invalid chainIds in NEXT_PUBLIC_ENABLED_CHAINS: ${invalid.join(",")}`
    )
  }

  return parsed
})()

/** Enabled networks for UI and portfolio. Filtered by NEXT_PUBLIC_ENABLED_CHAINS. */
export const NETWORKS: Network[] = ENABLED_CHAIN_IDS
  ? NETWORK_REGISTRY.filter((n) => ENABLED_CHAIN_IDS.includes(n.id))
  : NETWORK_REGISTRY

// ---------------------------------------------------------------------------
// Lookup — always works against the full registry so historical txs,
// explorer links, and chain adapters never break for disabled chains.
// ---------------------------------------------------------------------------

const registryMap = new Map<number, Network>(
  NETWORK_REGISTRY.map((n) => [n.id, n])
)

export function getNetwork(chainId: number): Network {
  const network = registryMap.get(chainId)
  if (!network) throw new Error(`Unsupported chainId: ${chainId}`)
  return network
}

export function getEVMNetworks(): Network[] {
  return NETWORKS.filter((n) => n.chainType === ChainType.EVM)
}
