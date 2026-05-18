import { OnboardingProvider } from "./context"
import { OnboardingGuard } from "./_components/guard"

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <OnboardingProvider>
      <OnboardingGuard>{children}</OnboardingGuard>
    </OnboardingProvider>
  )
}
