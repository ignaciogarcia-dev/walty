"use client"
import { RouteErrorBoundary } from "@/components/errors/RouteErrorBoundary"

export default function RootError(props: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <RouteErrorBoundary {...props} boundary="root" />
}
