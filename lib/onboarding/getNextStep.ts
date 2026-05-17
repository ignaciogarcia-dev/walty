export type WalletStatus =
  | "loading"
  | "new"
  | "locked"
  | "unlocked"
  | "recoverable"
  | "invalid-local"

export type OnboardingState = {
  isOwner: boolean
  hasActiveBusiness: boolean
  hasBusinessSettings: boolean
  walletStatus: WalletStatus
}

/**
 * Returns the URL of the next required onboarding step, or null if complete.
 *
 * Cashiers (members of someone else's business) skip wallet & business setup
 * — they sign nothing locally. Owners must set up their business and a wallet.
 */
export function getNextOnboardingStep({
  isOwner,
  hasActiveBusiness,
  hasBusinessSettings,
  walletStatus,
}: OnboardingState): string | null {
  if (walletStatus === "loading") return null

  if (!isOwner) {
    return hasActiveBusiness ? null : "/onboarding/welcome"
  }

  if (!hasBusinessSettings) return "/onboarding/setup-business"

  if (walletStatus === "new") return "/onboarding/create-wallet"
  if (walletStatus === "recoverable") return "/onboarding/recover"
  if (walletStatus === "invalid-local") return "/onboarding/recover?reason=invalid-local"

  return null
}
