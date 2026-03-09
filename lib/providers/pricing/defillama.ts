const STABLECOIN_IDS = new Set(["usd-coin", "tether", "dai"])

// DefiLlama uses "coingecko:{id}" format for CoinGecko-compatible IDs
export async function getPricesByIds(
  ids: string[]
): Promise<Record<string, number>> {
  const prices: Record<string, number> = {}

  const nonStable: string[] = []
  for (const id of ids) {
    if (STABLECOIN_IDS.has(id)) {
      prices[id] = 1.0
    } else {
      nonStable.push(id)
    }
  }

  if (nonStable.length === 0) return prices

  const llamaIds = nonStable.map((id) => `coingecko:${id}`).join(",")
  const url = `https://coins.llama.fi/prices/current/${llamaIds}`

  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) {
    throw new Error(`DefiLlama price error: ${res.status}`)
  }

  const data = (await res.json()) as {
    coins: Record<string, { price?: number }>
  }

  for (const id of nonStable) {
    const key = `coingecko:${id}`
    const price = data.coins[key]?.price
    if (price !== undefined) {
      prices[id] = price
    }
  }

  return prices
}
