import { getNextOnboardingStep } from "@/lib/onboarding/getNextStep"

interface DashboardRouteContext {
  user: {
    isOwner: boolean
    hasActiveBusiness: boolean
    hasBusinessSettings: boolean
    businessStatus: "active" | "revoked" | "suspended" | null
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

export function getDashboardRoute(context: DashboardRouteContext): DashboardRoute {
  const { user, pathname, walletStatus } = context

  // A suspended/revoked member must see the access page — checked BEFORE the
  // onboarding step, because a non-active membership has hasActiveBusiness=false,
  // which would otherwise resolve to /onboarding/welcome and leave the access
  // pages unreachable. Owners never carry a suspended/revoked status, so this is
  // a no-op for them.
  if (user.businessStatus === "revoked") {
    return { type: "access-revoked" }
  }
  if (user.businessStatus === "suspended") {
    return { type: "access-suspended" }
  }

  const nextOnboardingStep = getNextOnboardingStep({
    isOwner: user.isOwner,
    hasActiveBusiness: user.hasActiveBusiness,
    hasBusinessSettings: user.hasBusinessSettings,
    walletStatus,
  })
  if (nextOnboardingStep !== null) {
    return { type: "onboarding", step: nextOnboardingStep }
  }

  // Operators (non-owner members) are confined to /dashboard/business/*
  if (!user.isOwner && user.hasActiveBusiness && !pathname.startsWith("/dashboard/business")) {
    return { type: "operator-redirect" }
  }

  return { type: "allow" }
}
