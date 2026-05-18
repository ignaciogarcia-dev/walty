const DEFAULT_BASE_URL = "https://api.coingecko.com/api/v3"

const STABLECOIN_IDS = new Set(["usd-coin", "tether", "dai"])

function coinGeckoBaseUrl(): string {
  return process.env.COINGECKO_API_BASE_URL?.trim() || DEFAULT_BASE_URL
}

function getCoinGeckoUrl(pathname: string): URL {
  const baseUrl = coinGeckoBaseUrl()
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
  return new URL(pathname, normalizedBase)
}

/** Pro vs public/demo use different auth headers — sending both can yield 400. */
function coinGeckoAuthHeaders(apiKey: string): HeadersInit {
  const headers: HeadersInit = { Accept: "application/json" }
  if (coinGeckoBaseUrl().includes("pro-api.coingecko.com")) {
    headers["x-cg-pro-api-key"] = apiKey
  } else {
    headers["x-cg-demo-api-key"] = apiKey
  }
  return headers
}

/**
 * Returns USD prices by CoinGecko id. Stablecoins are always $1.
 * Never throws: on CoinGecko failure, returns stablecoin prices only so portfolio can still load.
 */
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

  const apiKey = process.env.COINGECKO_API_KEY?.trim()
  const headers: HeadersInit = apiKey
    ? coinGeckoAuthHeaders(apiKey)
    : { Accept: "application/json" }

  try {
    const url = getCoinGeckoUrl("simple/price")
    url.searchParams.set("ids", nonStable.join(","))
    url.searchParams.set("vs_currencies", "usd")

    const res = await fetch(url.toString(), { headers, cache: "no-store" })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.warn(
        `[pricing] CoinGecko ${res.status} (non-stable ids=${nonStable.length}):`,
        body.slice(0, 300)
      )
      return prices
    }

    const data = (await res.json()) as Record<string, { usd?: number }>

    for (const id of nonStable) {
      const price = data[id]?.usd
      if (price !== undefined) {
        prices[id] = price
      }
    }
  } catch (err) {
    console.warn("[pricing] CoinGecko request failed:", err)
  }

  return prices
}
