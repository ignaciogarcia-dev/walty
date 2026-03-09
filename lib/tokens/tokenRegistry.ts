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
    {
      symbol: "USDT",
      type: "erc20",
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      name: "Tether USD",
      decimals: 6,
      chainId: 1,
      coingeckoId: "tether",
    },
    {
      symbol: "DAI",
      type: "erc20",
      address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      name: "Dai",
      decimals: 18,
      chainId: 1,
      coingeckoId: "dai",
    },
    {
      symbol: "WETH",
      type: "erc20",
      address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      name: "Wrapped Ether",
      decimals: 18,
      chainId: 1,
      coingeckoId: "weth",
    },
    {
      symbol: "WBTC",
      type: "erc20",
      address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      name: "Wrapped Bitcoin",
      decimals: 8,
      chainId: 1,
      coingeckoId: "wrapped-bitcoin",
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
    {
      symbol: "ARB",
      type: "erc20",
      address: "0x912CE59144191C1204E64559FE8253a0e49E6548",
      name: "Arbitrum",
      decimals: 18,
      chainId: 42161,
      coingeckoId: "arbitrum",
    },
    {
      symbol: "WETH",
      type: "erc20",
      address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      name: "Wrapped Ether",
      decimals: 18,
      chainId: 42161,
      coingeckoId: "weth",
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
    {
      symbol: "WETH",
      type: "erc20",
      address: "0x4200000000000000000000000000000000000006",
      name: "Wrapped Ether",
      decimals: 18,
      chainId: 8453,
      coingeckoId: "weth",
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
    {
      symbol: "OP",
      type: "erc20",
      address: "0x4200000000000000000000000000000000000042",
      name: "Optimism",
      decimals: 18,
      chainId: 10,
      coingeckoId: "optimism",
    },
    {
      symbol: "WETH",
      type: "erc20",
      address: "0x4200000000000000000000000000000000000006",
      name: "Wrapped Ether",
      decimals: 18,
      chainId: 10,
      coingeckoId: "weth",
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
    {
      symbol: "USDT",
      type: "erc20",
      address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
      name: "Tether",
      decimals: 6,
      chainId: 137,
      coingeckoId: "tether",
    },
    {
      symbol: "WETH",
      type: "erc20",
      address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
      name: "Wrapped Ether",
      decimals: 18,
      chainId: 137,
      coingeckoId: "weth",
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
