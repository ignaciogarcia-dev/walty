"use client"
import { useEffect, useState, useCallback } from "react"
import type { TokenPosition } from "@/lib/portfolio/portfolio-engine"
import { getPortfolio } from "@/lib/portfolio/portfolio-engine"

export type { TokenPosition }

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
        const [portfolio, tokenImagesRes] = await Promise.all([
          getPortfolio(address!),
          fetch("/api/token-images")
            .then((r) => (r.ok ? r.json() : {}))
            .catch(() => ({})) as Promise<Record<string, string>>,
        ])

        if (cancelled) return

        // Merge image URLs into positions
        const withImages = portfolio.positions.map((p) => ({
          ...p,
          imageUrl: tokenImagesRes[p.token.symbol] ?? null,
        }))

        setPositions(withImages)
        setTotalUsd(portfolio.totalUsd)
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
