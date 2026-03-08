"use client"
import { useEffect, useState, useCallback } from "react"
import { formatUnits } from "viem"
import { TOKENS, type Token } from "@/lib/tokens"
import { getAllTokenBalances } from "@/lib/token-balances"

export type TokenPosition = {
  token: Token
  balance: string
  balanceRaw: bigint
  priceUsd: number
  valueUsd: number
  allocation: number
  imageUrl: string | null
}

export type PortfolioState = {
  positions: TokenPosition[]
  totalUsd: number
  loading: boolean
  error: string | null
  refresh: () => void
}

export function usePortfolio(address: string | null): PortfolioState {
  const [positions, setPositions] = useState<TokenPosition[]>([])
  const [totalUsd, setTotalUsd] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!address) return

    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const [balances, pricesRes, tokenImagesRes] = await Promise.all([
          getAllTokenBalances(address as `0x${string}`, TOKENS),
          fetch("/api/prices").then((r) => r.json()) as Promise<Record<string, number>>,
          fetch("/api/token-images")
            .then((r) => (r.ok ? r.json() : {}))
            .catch(() => ({})) as Promise<Record<string, string>>,
        ])

        if (cancelled) return

        const raw: TokenPosition[] = TOKENS.map((token) => {
          const balanceRaw = balances.get(token.symbol) ?? 0n
          const balance = formatUnits(balanceRaw, token.decimals)
          const priceUsd = pricesRes[token.symbol] ?? 0
          const valueUsd = parseFloat(balance) * priceUsd
          const imageUrl = tokenImagesRes[token.symbol] ?? null
          return { token, balance, balanceRaw, priceUsd, valueUsd, allocation: 0, imageUrl }
        })

        const total = raw.reduce((sum, p) => sum + p.valueUsd, 0)

        const withAllocation = raw.map((p) => ({
          ...p,
          allocation: total > 0 ? (p.valueUsd / total) * 100 : 0,
        }))

        setPositions(withAllocation)
        setTotalUsd(total)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error loading portfolio")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [address, tick])

  return { positions, totalUsd, loading, error, refresh }
}
