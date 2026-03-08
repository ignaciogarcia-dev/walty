export type Token = {
  symbol: string
  name: string
  address: `0x${string}` | null // null = native ETH/chain currency
  decimals: number
  chainId: number
  coingeckoId: string
}

// Ethereum mainnet token list
export const TOKENS: Token[] = [
  {
    symbol: "ETH",
    name: "Ethereum",
    address: null,
    decimals: 18,
    chainId: 1,
    coingeckoId: "ethereum",
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    decimals: 6,
    chainId: 1,
    coingeckoId: "usd-coin",
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    decimals: 6,
    chainId: 1,
    coingeckoId: "tether",
  },
  {
    symbol: "DAI",
    name: "Dai Stablecoin",
    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    decimals: 18,
    chainId: 1,
    coingeckoId: "dai",
  },
  {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    decimals: 18,
    chainId: 1,
    coingeckoId: "weth",
  },
  {
    symbol: "WBTC",
    name: "Wrapped Bitcoin",
    address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    decimals: 8,
    chainId: 1,
    coingeckoId: "wrapped-bitcoin",
  },
]

export function getTokenBySymbol(symbol: string): Token | undefined {
  return TOKENS.find((t) => t.symbol === symbol)
}

export function getTokenByAddress(address: string): Token | undefined {
  return TOKENS.find((t) => t.address?.toLowerCase() === address.toLowerCase())
}
