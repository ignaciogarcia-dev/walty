export type WalletStatus =
  | "loading"
  | "new"
  | "locked"
  | "unlocked"
  | "recoverable"
  | "invalid-local"

export type OnboardingState = {
  hasActiveBusiness: boolean
  userType: "person" | "business" | null
  walletStatus: WalletStatus
  hasProfile: boolean
}

/**
 * Returns the URL of the next required onboarding step, or null if complete.
 *
 * Used by the dashboard layout as the single onboarding orchestrator so that
 * individual auth and onboarding pages never need to know about each other.
 *
 * Layers:
 *   1. Still loading → can't decide yet
 *   2. Cashier (active business, non-owner) → require profile only
 *   3. No userType   → must choose user type (personal vs business)
 *   4. No profile    → must set up profile (name + optional username)
 *   5. Wallet state  → must create or recover wallet
 */
export function getNextOnboardingStep({
  hasActiveBusiness,
  userType,
  walletStatus,
  hasProfile,
}: OnboardingState): string | null {
  if (walletStatus === "loading") return null

  // Cashier flow: has an active business but is not the owner.
  // Cashiers use an owner-assigned wallet, so they skip wallet onboarding.
  if (hasActiveBusiness && userType !== "business") {
    if (!hasProfile) return "/onboarding/username"
    return null
  }

  if (!userType) return "/onboarding/account-type"
  if (!hasProfile) return "/onboarding/username"

  // Business owners must have an active business
  if (userType === "business" && !hasActiveBusiness) {
    return "/onboarding/setup-business"
  }

  if (walletStatus === "new") return "/onboarding/create-wallet"
  if (walletStatus === "recoverable") return "/onboarding/recover"
  if (walletStatus === "invalid-local") return "/onboarding/recover?reason=invalid-local"

  return null
}
