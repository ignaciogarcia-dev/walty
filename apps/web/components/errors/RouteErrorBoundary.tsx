"use client"
import { useEffect } from "react"
import { reportError } from "@/lib/observability/report"
import { ErrorFallback } from "./ErrorFallback"

export interface RouteErrorBoundaryProps {
  error: Error & { digest?: string }
  reset: () => void
  boundary: string // route tag attached to the report
}

// Shared body for every error.tsx: report once, then show the fallback.
export function RouteErrorBoundary({
  error,
  reset,
  boundary,
}: RouteErrorBoundaryProps) {
  useEffect(() => {
    reportError(error, { boundary, digest: error.digest })
  }, [error, boundary])

  return <ErrorFallback reset={reset} />
}
