"use client"

import { useState, useEffect } from "react"

export type BusinessRole = "owner" | "manager" | "cashier" | "waiter"

export type BusinessContextData = {
  isOwner: boolean
  role: BusinessRole
  businessId: number
  merchantWalletAddress: string | null
  businessName: string
}

type State = {
  data: BusinessContextData | null
  loading: boolean
  error: string | null
}

export function useBusinessContext() {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null })

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch("/api/business/context")
        if (res.status === 404) {
          if (!cancelled) setState({ data: null, loading: false, error: null })
          return
        }
        if (!res.ok) throw new Error("Failed to load business context")
        const json = await res.json()
        if (!cancelled) setState({ data: json, loading: false, error: null })
      } catch (e) {
        if (!cancelled) setState({ data: null, loading: false, error: e instanceof Error ? e.message : "error" })
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  return { ...state.data, loading: state.loading, error: state.error }
}
