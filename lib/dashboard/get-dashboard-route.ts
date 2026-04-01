/**
 * Pure routing decision function.
 *
 * Determines where a user should be redirected based on their state.
 * No I/O, no side effects — fully testable.
 */

import { getNextOnboardingStep } from "@/lib/onboarding/getNextStep"

interface DashboardRouteContext {
  user: {
    hasProfile: boolean
    hasActiveBusiness: boolean
    businessStatus: "active" | "revoked" | "suspended" | null
    userType: "person" | "business" | null
  }
  walletStatus: "loading" | "new" | "locked" | "unlocked" | "recoverable" | "invalid-local"
  pathname: string
}

export type DashboardRoute =
  | { type: "onboarding"; step: string }
  | { type: "access-revoked" }
  | { type: "access-suspended" }
  | { type: "operator-redirect" }
  | { type: "allow" }

/**
 * Decides where the user should go.
 *
 * Priority:
 * 1. Onboarding (if missing profile/wallet/etc)
 * 2. Business status (revoked/suspended)
 * 3. Operator confinement (cashiers → /business/*)
 * 4. Allow (no redirect needed)
 */
export function getDashboardRoute(context: DashboardRouteContext): DashboardRoute {
  const { user, pathname, walletStatus } = context

  // 1. Onboarding (highest priority)
  const nextOnboardingStep = getNextOnboardingStep({
    hasProfile: user.hasProfile,
    hasActiveBusiness: user.hasActiveBusiness,
    walletStatus,
    userType: user.userType,
  })
  if (nextOnboardingStep !== null) {
    return { type: "onboarding", step: nextOnboardingStep }
  }

  // 2. Business status checks
  if (user.businessStatus === "revoked") {
    return { type: "access-revoked" }
  }
  if (user.businessStatus === "suspended") {
    return { type: "access-suspended" }
  }

  // 3. Operator confinement
  // Operators (non-owner business members) are confined to /dashboard/business/*
  if (user.hasActiveBusiness === true && user.userType !== "business" && !pathname.startsWith("/dashboard/business")) {
    return { type: "operator-redirect" }
  }

  // 4. Allow navigation
  return { type: "allow" }
}
