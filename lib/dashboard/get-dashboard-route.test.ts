import { describe, expect, it } from "vitest"
import { getDashboardRoute } from "./get-dashboard-route"

describe("getDashboardRoute", () => {
  const baseContext = {
    user: {
      isOwner: true,
      hasActiveBusiness: true,
      hasBusinessSettings: true,
      businessStatus: null as null,
    },
    pathname: "/dashboard/home",
    walletStatus: "unlocked" as const,
  }

  describe("onboarding redirects", () => {
    it("redirects to onboarding if wallet is new", () => {
      const route = getDashboardRoute({
        ...baseContext,
        walletStatus: "new",
      })
      expect(route.type).toBe("onboarding")
      expect(route.type === "onboarding" && route.step).toBeDefined()
    })

    it("redirects owner without business settings to setup-business", () => {
      const route = getDashboardRoute({
        ...baseContext,
        user: { ...baseContext.user, hasActiveBusiness: false, hasBusinessSettings: false },
      })
      expect(route.type).toBe("onboarding")
      expect(route.type === "onboarding" && route.step).toBe("/onboarding/setup-business")
    })
  })

  describe("business status redirects", () => {
    it("redirects to access-revoked if revoked", () => {
      const route = getDashboardRoute({
        ...baseContext,
        user: { ...baseContext.user, businessStatus: "revoked" as const },
      })
      expect(route).toEqual({ type: "access-revoked" })
    })

    it("redirects to access-suspended if suspended", () => {
      const route = getDashboardRoute({
        ...baseContext,
        user: { ...baseContext.user, businessStatus: "suspended" as const },
      })
      expect(route).toEqual({ type: "access-suspended" })
    })
  })

  describe("operator confinement", () => {
    it("redirects operator outside /business/* to business home", () => {
      const route = getDashboardRoute({
        ...baseContext,
        user: { ...baseContext.user, isOwner: false, hasBusinessSettings: false },
        pathname: "/dashboard/activity",
      })
      expect(route).toEqual({ type: "operator-redirect" })
    })

    it("allows operator under /business/*", () => {
      const route = getDashboardRoute({
        ...baseContext,
        user: { ...baseContext.user, isOwner: false, hasBusinessSettings: false },
        pathname: "/dashboard/business/home",
      })
      expect(route).toEqual({ type: "allow" })
    })

    it("allows owner anywhere under /dashboard", () => {
      const route = getDashboardRoute({
        ...baseContext,
        pathname: "/dashboard/activity",
      })
      expect(route).toEqual({ type: "allow" })
    })
  })

  describe("allow navigation", () => {
    it("allows normal user to navigate", () => {
      const route = getDashboardRoute(baseContext)
      expect(route).toEqual({ type: "allow" })
    })
  })

  describe("priority order", () => {
    it("prioritizes onboarding over status redirects", () => {
      const route = getDashboardRoute({
        ...baseContext,
        walletStatus: "new",
        user: {
          ...baseContext.user,
          businessStatus: "revoked" as const,
        },
      })
      expect(route.type).toBe("onboarding")
    })

    it("prioritizes business status over operator confinement", () => {
      const route = getDashboardRoute({
        ...baseContext,
        user: {
          ...baseContext.user,
          isOwner: false,
          hasBusinessSettings: false,
          businessStatus: "revoked" as const,
        },
        pathname: "/dashboard/activity",
      })
      expect(route).toEqual({ type: "access-revoked" })
    })
  })
})
