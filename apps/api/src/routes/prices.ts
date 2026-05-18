import { Router } from "express"
import { ALL_TOKENS } from "@walty/shared/tokens/tokenRegistry"
import { getPrices } from "@walty/shared/providers/pricing/pricingRouter"
import { asyncHandler } from "../middleware/asyncHandler.js"

export const pricesRouter: Router = Router()

let priceCache: { data: Record<string, number>; ts: number } | null = null
const CACHE_TTL = 30_000

pricesRouter.get(
  "/prices",
  asyncHandler(async (_req, res) => {
    if (priceCache && Date.now() - priceCache.ts < CACHE_TTL) {
      res.json(priceCache.data)
      return
    }

    const coingeckoIds = [...new Set(ALL_TOKENS.map((t) => t.coingeckoId))]

    try {
      const pricesByCoingeckoId = await getPrices(coingeckoIds)
      const prices: Record<string, number> = {}
      for (const token of ALL_TOKENS) {
        const price = pricesByCoingeckoId[token.coingeckoId]
        if (price !== undefined) prices[token.symbol] = price
      }
      priceCache = { data: prices, ts: Date.now() }
      res.json(prices)
    } catch {
      res.json(priceCache?.data ?? {})
    }
  }),
)
