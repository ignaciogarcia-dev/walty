"use client"
import { useQuery } from "@tanstack/react-query"
import { getPortfolio, type TokenPosition } from "@/lib/portfolio/portfolio-engine"

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
		queryFn: () => getPortfolio(address!),
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
