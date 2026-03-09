import * as coingecko from "./coingecko"
import * as defillama from "./defillama"

export async function getPrices(
  ids: string[]
): Promise<Record<string, number>> {
  try {
    return await coingecko.getPricesByIds(ids)
  } catch {
    return await defillama.getPricesByIds(ids)
  }
}
