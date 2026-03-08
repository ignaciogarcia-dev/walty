import { NextResponse } from "next/server"
import { TOKENS } from "@/lib/tokens"

type CoinGeckoMarket = {
  id: string
  image?: string
}

let imageCache: { data: Record<string, string>; ts: number } | null = null
const CACHE_TTL = 6 * 60 * 60 * 1000
const DEFAULT_BASE_URL = "https://api.coingecko.com/api/v3"

function getCoinGeckoUrl(pathname: string): URL {
  const baseUrl = process.env.COINGECKO_API_BASE_URL?.trim() || DEFAULT_BASE_URL
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
  return new URL(pathname, normalizedBase)
}

async function fetchCoinGeckoImages(ids: string[]): Promise<Map<string, string>> {
  const url = getCoinGeckoUrl("coins/markets")
  url.searchParams.set("vs_currency", "usd")
  url.searchParams.set("ids", ids.join(","))
  url.searchParams.set("order", "market_cap_desc")
  url.searchParams.set("per_page", String(ids.length))
  url.searchParams.set("page", "1")
  url.searchParams.set("sparkline", "false")

  const apiKey = process.env.COINGECKO_API_KEY?.trim()
  const headers: HeadersInit = { Accept: "application/json" }

  if (apiKey) {
    headers["x-cg-demo-api-key"] = apiKey
    headers["x-cg-pro-api-key"] = apiKey
  }

  const res = await fetch(url.toString(), { headers, cache: "no-store" })

  if (!res.ok) {
    throw new Error(`CoinGecko request failed: ${res.status}`)
  }

  const data = (await res.json()) as CoinGeckoMarket[]
  return new Map(
    data
      .filter((item) => item.image)
      .map((item) => [item.id, item.image as string])
  )
}

export async function GET() {
  if (imageCache && Date.now() - imageCache.ts < CACHE_TTL) {
    return NextResponse.json(imageCache.data)
  }

  const coingeckoIds = [...new Set(TOKENS.map((token) => token.coingeckoId))]

  try {
    const imagesById = await fetchCoinGeckoImages(coingeckoIds)
    const imagesBySymbol: Record<string, string> = {}

    for (const token of TOKENS) {
      const imageUrl = imagesById.get(token.coingeckoId)
      if (imageUrl) {
        imagesBySymbol[token.symbol] = imageUrl
      }
    }

    imageCache = { data: imagesBySymbol, ts: Date.now() }
    return NextResponse.json(imagesBySymbol)
  } catch {
    return NextResponse.json(imageCache?.data ?? {})
  }
}
