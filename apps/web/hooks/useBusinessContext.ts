"use client"
import { useQuery } from "@tanstack/react-query"
import { unwrap } from "@/lib/api/unwrap"

export type BusinessRole = "owner" | "cashier"

export type BusinessContextData = {
  isOwner: boolean
  role: BusinessRole
  businessId: number
  merchantWalletAddress: string | null
  businessName: string
  /** True when the business owner is on MPC custody — cashiers get HD child addresses. */
  isMpc: boolean
}

export const BUSINESS_CONTEXT_QUERY_KEY = ["business-context"] as const

async function fetchBusinessContext(): Promise<BusinessContextData | null> {
  const res = await fetch("/api/business/context")
  if (res.status === 404) return null
  if (!res.ok) throw new Error("Failed to load business context")
  return unwrap<BusinessContextData>(await res.json())
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
