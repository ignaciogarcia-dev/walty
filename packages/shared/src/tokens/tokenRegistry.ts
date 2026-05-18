export type Token = {
  symbol: string
  name: string
  address: `0x${string}` | null
  type: "native" | "erc20"
  decimals: number
  chainId: number
  coingeckoId: string
}

export const TOKEN_REGISTRY: Record<number, Token[]> = {
  1: [
    {
      symbol: "ETH",
      type: "native",
      address: null,
      name: "Ethereum",
      decimals: 18,
      chainId: 1,
      coingeckoId: "ethereum",
    },
    {
      symbol: "USDC",
      type: "erc20",
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      name: "USD Coin",
      decimals: 6,
      chainId: 1,
      coingeckoId: "usd-coin",
    },
  ],
  42161: [
    {
      symbol: "ETH",
      type: "native",
      address: null,
      name: "Ethereum",
      decimals: 18,
      chainId: 42161,
      coingeckoId: "ethereum",
    },
    {
      symbol: "USDC",
      type: "erc20",
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      name: "USD Coin",
      decimals: 6,
      chainId: 42161,
      coingeckoId: "usd-coin",
    },
  ],
  8453: [
    {
      symbol: "ETH",
      type: "native",
      address: null,
      name: "Ethereum",
      decimals: 18,
      chainId: 8453,
      coingeckoId: "ethereum",
    },
    {
      symbol: "USDC",
      type: "erc20",
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      name: "USD Coin",
      decimals: 6,
      chainId: 8453,
      coingeckoId: "usd-coin",
    },
  ],
  10: [
    {
      symbol: "ETH",
      type: "native",
      address: null,
      name: "Ethereum",
      decimals: 18,
      chainId: 10,
      coingeckoId: "ethereum",
    },
    {
      symbol: "USDC",
      type: "erc20",
      address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
      name: "USD Coin",
      decimals: 6,
      chainId: 10,
      coingeckoId: "usd-coin",
    },
  ],
  137: [
    {
      symbol: "MATIC",
      type: "native",
      address: null,
      name: "Polygon",
      decimals: 18,
      chainId: 137,
      coingeckoId: "matic-network",
    },
    {
      symbol: "USDC",
      type: "erc20",
      address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      name: "USD Coin",
      decimals: 6,
      chainId: 137,
      coingeckoId: "usd-coin",
    },
  ],
}

export const ALL_TOKENS: Token[] = Object.values(TOKEN_REGISTRY).flat()

export function getTokensByChain(chainId: number): Token[] {
  return TOKEN_REGISTRY[chainId] ?? []
}

export function getTokenByAddress(
  address: string,
  chainId: number
): Token | undefined {
  const tokens = TOKEN_REGISTRY[chainId]
  if (!tokens) return undefined
  return tokens.find(
    (t) => t.address?.toLowerCase() === address.toLowerCase()
  )
}

/** Returns the USDC token for a given chain, or null if the chain is unknown. */
export function getRelayToken(chainId: number): Token | null {
  return TOKEN_REGISTRY[chainId]?.find((t) => t.symbol === "USDC") ?? null
}
