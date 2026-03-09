const DEFAULT_BASE_URL = "https://api.coingecko.com/api/v3"

const STABLECOIN_IDS = new Set(["usd-coin", "tether", "dai"])

function getCoinGeckoUrl(pathname: string): URL {
  const baseUrl =
    process.env.COINGECKO_API_BASE_URL?.trim() || DEFAULT_BASE_URL
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
  return new URL(pathname, normalizedBase)
}

export async function getPricesByIds(
  ids: string[]
): Promise<Record<string, number>> {
  const prices: Record<string, number> = {}

  // Hardcode stablecoins to $1 — avoids circular pricing
  const nonStable: string[] = []
  for (const id of ids) {
    if (STABLECOIN_IDS.has(id)) {
      prices[id] = 1.0
    } else {
      nonStable.push(id)
    }
  }

  if (nonStable.length === 0) return prices

  const url = getCoinGeckoUrl("simple/price")
  url.searchParams.set("ids", nonStable.join(","))
  url.searchParams.set("vs_currencies", "usd")

  const apiKey = process.env.COINGECKO_API_KEY?.trim()
  const headers: HeadersInit = { Accept: "application/json" }
  if (apiKey) {
    headers["x-cg-demo-api-key"] = apiKey
    headers["x-cg-pro-api-key"] = apiKey
  }

  const res = await fetch(url.toString(), { headers, cache: "no-store" })
  if (!res.ok) {
    throw new Error(`CoinGecko price error: ${res.status}`)
  }

  const data = (await res.json()) as Record<string, { usd?: number }>

  for (const id of nonStable) {
    const price = data[id]?.usd
    if (price !== undefined) {
      prices[id] = price
    }
  }

  return prices
}
