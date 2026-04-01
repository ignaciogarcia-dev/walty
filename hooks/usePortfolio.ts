"use client"
import { useQuery } from "@tanstack/react-query"
import type { TokenPosition } from "@/lib/portfolio/portfolio-engine"

export type { TokenPosition }

export type PortfolioState = {
	positions: TokenPosition[]
	totalUsd: number
	loading: boolean
	error: string | null
	refresh: () => void
}

export function usePortfolio(address: string | null): PortfolioState {
	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["portfolio", address],
		queryFn: async () => {
			const res = await fetch(
				`/api/portfolio?address=${encodeURIComponent(address!)}`
			)
			const body = (await res.json().catch(() => null)) as {
				data?: { positions: TokenPosition[]; totalUsd: number }
			} | null
			if (!res.ok || !body?.data) {
				throw new Error("Failed to load portfolio")
			}
			return body.data
		},
		enabled: !!address,
		staleTime: 30_000,
	})

	return {
		positions: data?.positions ?? [],
		totalUsd: data?.totalUsd ?? 0,
		loading: isLoading,
		error: error instanceof Error ? error.message : null,
		refresh: () => { void refetch() },
	}
}
