"use client"
import { useQuery } from "@tanstack/react-query"

export type BusinessRole = "owner" | "cashier"

export type BusinessContextData = {
  isOwner: boolean
  role: BusinessRole
  businessId: number
  merchantWalletAddress: string | null
  businessName: string
}

export const BUSINESS_CONTEXT_QUERY_KEY = ["business-context"] as const

async function fetchBusinessContext(): Promise<BusinessContextData | null> {
  const res = await fetch("/api/business/context")
  if (res.status === 404) return null
  if (!res.ok) throw new Error("Failed to load business context")
  const { data } = await res.json()
  return data as BusinessContextData
}

export function useBusinessContext() {
  const { data, isLoading, error } = useQuery({
    queryKey: BUSINESS_CONTEXT_QUERY_KEY,
    queryFn: fetchBusinessContext,
    staleTime: 5 * 60_000,
  })

  return {
    ...(data ?? {}),
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
  }
}
