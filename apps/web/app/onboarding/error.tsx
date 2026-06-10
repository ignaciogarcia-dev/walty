"use client"
import { RouteErrorBoundary } from "@/components/errors/RouteErrorBoundary"

export default function OnboardingError(props: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <RouteErrorBoundary {...props} boundary="onboarding" />
}
