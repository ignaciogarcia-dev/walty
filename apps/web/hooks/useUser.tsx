"use client"
import { useQuery } from "@tanstack/react-query"
import { unwrap } from "@/lib/api/unwrap"

export type BusinessStatus = "active" | "suspended" | "revoked" | null

type SessionResponse = {
  user: {
    id: number
    email: string
    isOwner?: boolean
    hasWallet?: boolean
    hasActiveBusiness?: boolean
    hasBusinessSettings?: boolean
    businessStatus?: BusinessStatus
  }
  business?: { name: string | null } | null
}

export interface UserData {
  id: number
  email: string
  isOwner: boolean
  hasWallet: boolean
  hasActiveBusiness: boolean
  hasBusinessSettings: boolean
  businessStatus: BusinessStatus
  businessName: string | null
}

export type UserState = {
  user: UserData | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

async function fetchSession(): Promise<UserData | null> {
  const res = await fetch("/api/session")
  if (res.status === 401) return null
  if (!res.ok) throw new Error("Failed to fetch session")
  const { user: userData, business } = unwrap<SessionResponse>(await res.json())
  return {
    id: userData.id,
    email: userData.email,
    isOwner: !!userData.isOwner,
    hasWallet: !!userData.hasWallet,
    hasActiveBusiness: !!userData.hasActiveBusiness,
    hasBusinessSettings: !!userData.hasBusinessSettings,
    businessStatus: userData.businessStatus ?? null,
    businessName: business?.name ?? null,
  }
}

export const SESSION_QUERY_KEY = ["session"] as const

export function useUser(): UserState {
  const { data: user, isLoading, error, refetch } = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchSession,
  })

  return {
    user: user ?? null,
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    refetch: async () => { await refetch() },
  }
}
