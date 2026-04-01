"use client"
import { useQuery } from "@tanstack/react-query"

export type BusinessStatus = "active" | "suspended" | "revoked" | null

export interface UserData {
  id: number
  email: string
  displayName: string | null
  username: string | null
  userType: "person" | "business" | null
  hasWallet: boolean
  hasProfile: boolean
  hasActiveBusiness: boolean
  businessStatus: BusinessStatus
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
  const { user: userData, profile } = data
  const displayName = profile.displayName ?? null
  return {
    id: userData.id,
    email: userData.email,
    displayName,
    username: profile.username ?? null,
    userType: userData.userType ?? null,
    hasWallet: userData.hasWallet ?? false,
    hasProfile: !!displayName,
    hasActiveBusiness: userData.hasActiveBusiness ?? false,
    businessStatus: userData.businessStatus ?? null,
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

// Kept for backward compat — no longer wraps a context.
// TanStack Query deduplicates useUser() automatically.
export function UserProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
