import { formatUnits } from "viem"
import { getEVMNetworks } from "@walty/shared/networks/networks"
import { getAdapter } from "@/lib/chainAdapters/adapterRegistry"
import { TOKEN_REGISTRY, type Token } from "@walty/shared/tokens/tokenRegistry"

async function fetchPricesBySymbol(): Promise<Record<string, number>> {
  try {
    const res = await fetch("/api/prices")
    if (!res.ok) return {}
    return (await res.json()) as Record<string, number>
  } catch {
    return {}
  }
}

export type TokenPosition = {
  token: Token
  chainId: number
  balance: string
  balanceRaw?: bigint
  priceUsd: number
  valueUsd: number
  allocation: number
  imageUrl: string | null
}

export async function getPortfolio(
  address: string
): Promise<{ positions: TokenPosition[]; totalUsd: number }> {
  const networks = getEVMNetworks()

  // 1. Fetch balances from all chains in parallel (allSettled = resilient)
  const balanceResults = await Promise.allSettled(
    networks.map(async (network) => {
      const tokens = TOKEN_REGISTRY[network.id] ?? []
      if (tokens.length === 0) return { chainId: network.id, balances: new Map<string, bigint>() }

      const adapter = getAdapter(network.id)
      const balances = await adapter.getTokenBalances(address, tokens)
      return { chainId: network.id, balances }
    })
  )

  // 2. Fetch prices by symbol from the API (server handles CoinGecko + caching)
  const pricesBySymbol = await fetchPricesBySymbol()

  // 4. Build positions
  const positions: TokenPosition[] = []

  for (const result of balanceResults) {
    if (result.status !== "fulfilled") continue

    const { chainId, balances } = result.value
    const tokens = TOKEN_REGISTRY[chainId] ?? []

    for (const token of tokens) {
      const balanceRaw = balances.get(token.symbol) ?? 0n
      const balance = formatUnits(balanceRaw, token.decimals)
      const priceUsd = pricesBySymbol[token.symbol] ?? 0
      const valueUsd = parseFloat(balance) * priceUsd

      positions.push({
        token,
        chainId,
        balance,
        balanceRaw,
        priceUsd,
        valueUsd,
        allocation: 0,
        imageUrl: null,
      })
    }
  }

  // 5. Calculate total and allocations
  const totalUsd = positions.reduce((sum, p) => sum + p.valueUsd, 0)

  for (const p of positions) {
    p.allocation = totalUsd > 0 ? (p.valueUsd / totalUsd) * 100 : 0
  }

  // 6. Sort: valueUsd > 0 first, then by valueUsd desc
  positions.sort((a, b) => {
    const aHasBalance = a.valueUsd > 0 ? 1 : 0
    const bHasBalance = b.valueUsd > 0 ? 1 : 0
    if (aHasBalance !== bHasBalance) return bHasBalance - aHasBalance
    return b.valueUsd - a.valueUsd
  })

  return { positions, totalUsd }
}
