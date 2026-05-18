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

  const nextOnboardingStep = getNextOnboardingStep({
    isOwner: user.isOwner,
    hasActiveBusiness: user.hasActiveBusiness,
    hasBusinessSettings: user.hasBusinessSettings,
    walletStatus,
  })
  if (nextOnboardingStep !== null) {
    return { type: "onboarding", step: nextOnboardingStep }
  }

  if (user.businessStatus === "revoked") {
    return { type: "access-revoked" }
  }
  if (user.businessStatus === "suspended") {
    return { type: "access-suspended" }
  }

  // Operators (non-owner members) are confined to /dashboard/business/*
  if (!user.isOwner && user.hasActiveBusiness && !pathname.startsWith("/dashboard/business")) {
    return { type: "operator-redirect" }
  }

  return { type: "allow" }
}
