import * as zerox from "./zerox"
import * as oneinch from "./oneinch"
import type { SwapParams, SwapQuote, SwapPrice, SwapPriceParams } from "./zerox"

export type { SwapParams, SwapQuote, SwapPrice, SwapPriceParams }

export async function getPrice(params: SwapPriceParams): Promise<SwapPrice> {
  return zerox.getPrice(params)
}

export async function getBestQuote(params: SwapParams): Promise<SwapQuote> {
  const [r0x, r1inch] = await Promise.allSettled([
    zerox.getSwapQuote(params),
    oneinch.getSwapQuote(params),
  ])

  const quotes: SwapQuote[] = []
  if (r0x.status === "fulfilled") quotes.push(r0x.value)
  if (r1inch.status === "fulfilled") quotes.push(r1inch.value)

  if (quotes.length === 0) {
    // Both failed — throw the 0x error (primary) if available
    if (r0x.status === "rejected") throw r0x.reason
    if (r1inch.status === "rejected") throw r1inch.reason
    throw new Error("No swap quotes available")
  }

  if (quotes.length === 1) return quotes[0]

  // Compare buyAmount — higher is better for the user
  return BigInt(quotes[0].buyAmount) >= BigInt(quotes[1].buyAmount)
    ? quotes[0]
    : quotes[1]
}
