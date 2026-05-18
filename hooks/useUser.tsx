"use client"
import { useQuery } from "@tanstack/react-query"

export type BusinessStatus = "active" | "suspended" | "revoked" | null

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

export async function fetchSession(): Promise<UserData | null> {
  const res = await fetch("/api/session")
  if (!res.ok) throw new Error("Failed to fetch session")
  const { data } = await res.json()
  const { user: userData, business } = data
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

export function UserProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
