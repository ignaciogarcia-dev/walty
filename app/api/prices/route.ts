import { NextResponse } from "next/server"
import { ALL_TOKENS } from "@/lib/tokens/tokenRegistry"
import { getPrices } from "@/lib/providers/pricing/pricingRouter"

// Module-level cache — persists across requests in the same serverless instance
let priceCache: { data: Record<string, number>; ts: number } | null = null
const CACHE_TTL = 30_000

export async function GET() {
  if (priceCache && Date.now() - priceCache.ts < CACHE_TTL) {
    return NextResponse.json(priceCache.data)
  }

  // Dedup coingeckoIds across all chains
  const coingeckoIds = [...new Set(ALL_TOKENS.map((t) => t.coingeckoId))]

  try {
    const pricesByCoingeckoId = await getPrices(coingeckoIds)

    // Map to symbol-based record for backwards compat with hooks
    // Use coingeckoId as key so multi-chain tokens share the same price
    const prices: Record<string, number> = {}
    for (const token of ALL_TOKENS) {
      const price = pricesByCoingeckoId[token.coingeckoId]
      if (price !== undefined) {
        prices[token.symbol] = price
      }
    }

    priceCache = { data: prices, ts: Date.now() }
    return NextResponse.json(prices)
  } catch {
    return NextResponse.json(priceCache?.data ?? {})
  }
}
