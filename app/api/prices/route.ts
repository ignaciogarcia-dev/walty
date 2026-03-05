import { NextResponse } from "next/server"
import { TOKENS } from "@/lib/tokens"
import { getPrice } from "@/lib/0x"

// Module-level cache — persists across requests in the same serverless instance
let priceCache: { data: Record<string, number>; ts: number } | null = null
const CACHE_TTL = 30_000

// Stablecoins hardcoded to $1 to avoid circular pricing
const STABLECOINS = new Set(["USDC", "USDT", "DAI"])

export async function GET() {
  if (priceCache && Date.now() - priceCache.ts < CACHE_TTL) {
    return NextResponse.json(priceCache.data)
  }

  const prices: Record<string, number> = {}

  // Hardcode stablecoins
  for (const sym of STABLECOINS) {
    prices[sym] = 1.0
  }

  const pricedTokens = TOKENS.filter((t) => !STABLECOINS.has(t.symbol))

  await Promise.allSettled(
    pricedTokens.map(async (token) => {
      try {
        const sellAmount = (BigInt(10) ** BigInt(token.decimals)).toString()
        // buyToken: USDC mainnet address — 0x v2 requires token addresses
        const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
        const res = await getPrice({
          sellToken: token.address, // null = native ETH, handled in lib/0x.ts
          buyToken: USDC,
          sellAmount,
          chainId: 1,
        })
        // v2 has no `price` field — compute from buyAmount (USDC, 6 dec) / sellAmount (token base units)
        const usdcAmount = parseFloat(res.buyAmount) / 1e6
        const tokenAmount = parseFloat(res.sellAmount) / 10 ** token.decimals
        prices[token.symbol] = usdcAmount / tokenAmount
      } catch {
        // Skip — price will be absent / 0
      }
    })
  )

  priceCache = { data: prices, ts: Date.now() }
  return NextResponse.json(prices)
}
