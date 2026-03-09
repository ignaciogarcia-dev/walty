"use client"
import { useEffect, useState, useCallback } from "react"
import type { TokenPosition } from "@/lib/portfolio/portfolio-engine"

// balanceRaw (bigint) is stripped at the API boundary — not needed in UI
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
        const [portfolioRes, tokenImagesRes] = await Promise.all([
          fetch(`/api/portfolio?address=${encodeURIComponent(address!)}`)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Portfolio fetch failed"))))
            .catch(() => ({ positions: [], totalUsd: 0 })) as Promise<{
            positions: TokenPosition[]
            totalUsd: number
          }>,
          fetch("/api/token-images")
            .then((r) => (r.ok ? r.json() : {}))
            .catch(() => ({})) as Promise<Record<string, string>>,
        ])

        if (cancelled) return

        // Merge image URLs into positions
        const withImages = portfolioRes.positions.map((p) => ({
          ...p,
          imageUrl: tokenImagesRes[p.token.symbol] ?? null,
        }))

        setPositions(withImages)
        setTotalUsd(portfolioRes.totalUsd)
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
