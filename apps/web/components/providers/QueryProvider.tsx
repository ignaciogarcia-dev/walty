"use client"
import { useState } from "react"
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"
import { reportError } from "@/lib/observability/report"

// QueryClient with global error reporting: failed queries and mutations route
// through reportError so client data errors are not silent in production.
export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => reportError(error, { source: "react-query" }),
    }),
    mutationCache: new MutationCache({
      onError: (error) => reportError(error, { source: "react-query" }),
    }),
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: true,
        retry: 1,
      },
    },
  })
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(createQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
