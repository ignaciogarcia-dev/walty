import { describe, expect, it } from "vitest"
import { getDashboardRoute } from "./get-dashboard-route"

describe("getDashboardRoute", () => {
  const baseContext = {
    user: {
      hasProfile: true,
      hasActiveBusiness: true,
      businessStatus: null,
      userType: "business" as const,
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

    it("redirects to onboarding if missing profile", () => {
      const route = getDashboardRoute({
        ...baseContext,
        user: { ...baseContext.user, hasProfile: false },
      })
      expect(route.type).toBe("onboarding")
      expect(route.type === "onboarding" && route.step).toBeDefined()
    })

    it("redirects to onboarding if missing active business when needed", () => {
      const route = getDashboardRoute({
        ...baseContext,
        user: { ...baseContext.user, hasActiveBusiness: false, userType: "business" },
      })
      expect(route.type).toBe("onboarding")
      expect(route.type === "onboarding" && route.step).toBeDefined()
    })
  })

  describe("business status redirects", () => {
    it("redirects to access-revoked if revoked", () => {
      const route = getDashboardRoute({
        ...baseContext,
        user: { ...baseContext.user, businessStatus: "revoked" },
      })
      expect(route).toEqual({ type: "access-revoked" })
    })

    it("redirects to access-suspended if suspended", () => {
      const route = getDashboardRoute({
        ...baseContext,
        user: { ...baseContext.user, businessStatus: "suspended" },
      })
      expect(route).toEqual({ type: "access-suspended" })
    })
  })

  describe("operator confinement", () => {
    it("redirects operator to /business/* if accessing person routes", () => {
      const route = getDashboardRoute({
        ...baseContext,
        user: { ...baseContext.user, userType: "person", hasActiveBusiness: true },
        pathname: "/dashboard/send",
      })
      expect(route).toEqual({ type: "operator-redirect" })
    })

    it("allows operator to access /business/* routes", () => {
      const route = getDashboardRoute({
        ...baseContext,
        user: { ...baseContext.user, userType: "person", hasActiveBusiness: true },
        pathname: "/dashboard/business/home",
      })
      expect(route).toEqual({ type: "allow" })
    })

    it("allows owner to access person routes", () => {
      const route = getDashboardRoute({
        ...baseContext,
        user: { ...baseContext.user, userType: "business", hasActiveBusiness: true },
        pathname: "/dashboard/send",
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
    it("prioritizes onboarding over other redirects", () => {
      const route = getDashboardRoute({
        ...baseContext,
        walletStatus: "new",
        user: {
          ...baseContext.user,
          businessStatus: "revoked",
        },
      })
      // Onboarding should win
      expect(route.type).toBe("onboarding")
    })

    it("prioritizes business status over operator confinement", () => {
      const route = getDashboardRoute({
        ...baseContext,
        user: {
          ...baseContext.user,
          userType: "person",
          hasActiveBusiness: true,
          businessStatus: "revoked",
        },
        pathname: "/dashboard/send",
      })
      // Business status should win
      expect(route).toEqual({ type: "access-revoked" })
    })
  })
})
