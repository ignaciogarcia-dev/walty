import { describe, expect, it } from "vitest"
import { resolvePermissions, hasPermission } from "./resolve"
import { Permission, type Actor, type PermissionContext } from "./types"
import type { AuthPayload } from "@/lib/auth"
import type { BusinessContext } from "@/lib/business/getBusinessContext"

const mockUser: AuthPayload = { userId: 1, email: "test@example.com" }
const userActor: Actor = { type: "user", user: mockUser }
const agentActor: Actor = { type: "agent", agentId: "agent-1" }

function makeBusinessContext(isOwner: boolean): BusinessContext {
  return {
    businessId: 42,
    isOwner,
    role: isOwner ? "owner" : "manager",
    merchantWalletAddress: "0x1234567890123456789012345678901234567890",
    businessName: "Test Business",
  } as BusinessContext
}

const noBusinessCtx: PermissionContext = { businessContext: null }
const memberCtx: PermissionContext = { businessContext: makeBusinessContext(false) }
const ownerCtx: PermissionContext = { businessContext: makeBusinessContext(true) }

describe("resolvePermissions", () => {
  it("throws for agent actor", () => {
    expect(() => resolvePermissions(agentActor)).toThrow("Agent permissions not implemented")
  })

  describe("user without business context", () => {
    it("has BASE permissions", () => {
      const perms = resolvePermissions(userActor, noBusinessCtx)
      expect(perms).toContain(Permission.SEND_TOKEN)
      expect(perms).toContain(Permission.MANAGE_CONTACTS)
    })

    it("has JOIN_BUSINESS permission", () => {
      const perms = resolvePermissions(userActor, noBusinessCtx)
      expect(perms).toContain(Permission.JOIN_BUSINESS)
    })

    it("does NOT have business-only permissions", () => {
      const perms = resolvePermissions(userActor, noBusinessCtx)
      expect(perms).not.toContain(Permission.PAYMENT_REQUEST_CREATE)
      expect(perms).not.toContain(Permission.MEMBER_LIST)
      expect(perms).not.toContain(Permission.REFUND_REVIEW)
    })
  })

  describe("user with business context (non-owner)", () => {
    it("has BASE permissions", () => {
      const perms = resolvePermissions(userActor, memberCtx)
      expect(perms).toContain(Permission.SEND_TOKEN)
      expect(perms).toContain(Permission.MANAGE_CONTACTS)
    })

    it("has BUSINESS_ANY_ROLE permissions", () => {
      const perms = resolvePermissions(userActor, memberCtx)
      expect(perms).toContain(Permission.PAYMENT_REQUEST_CREATE)
      expect(perms).toContain(Permission.PAYMENT_REQUEST_READ)
      expect(perms).toContain(Permission.PAYMENT_REQUEST_CANCEL)
      expect(perms).toContain(Permission.PAYMENT_HISTORY_READ)
      expect(perms).toContain(Permission.BUSINESS_CONTEXT_READ)
      expect(perms).toContain(Permission.REFUND_REQUEST_CREATE)
      expect(perms).toContain(Permission.REFUND_REQUEST_LIST)
    })

    it("does NOT have BUSINESS_OWNER permissions", () => {
      const perms = resolvePermissions(userActor, memberCtx)
      expect(perms).not.toContain(Permission.MEMBER_LIST)
      expect(perms).not.toContain(Permission.MEMBER_INVITE)
      expect(perms).not.toContain(Permission.MEMBER_MANAGE)
      expect(perms).not.toContain(Permission.REFUND_REVIEW)
    })

    it("does NOT have JOIN_BUSINESS (already in a business)", () => {
      const perms = resolvePermissions(userActor, memberCtx)
      expect(perms).not.toContain(Permission.JOIN_BUSINESS)
    })
  })

  describe("user with business context (owner)", () => {
    it("has all permissions: BASE + BUSINESS_ANY_ROLE + BUSINESS_OWNER", () => {
      const perms = resolvePermissions(userActor, ownerCtx)
      // BASE
      expect(perms).toContain(Permission.SEND_TOKEN)
      expect(perms).toContain(Permission.MANAGE_CONTACTS)
      // BUSINESS_ANY_ROLE
      expect(perms).toContain(Permission.PAYMENT_REQUEST_CREATE)
      expect(perms).toContain(Permission.REFUND_REQUEST_LIST)
      // BUSINESS_OWNER
      expect(perms).toContain(Permission.MEMBER_LIST)
      expect(perms).toContain(Permission.MEMBER_INVITE)
      expect(perms).toContain(Permission.MEMBER_MANAGE)
      expect(perms).toContain(Permission.REFUND_REVIEW)
    })

    it("does NOT have JOIN_BUSINESS", () => {
      const perms = resolvePermissions(userActor, ownerCtx)
      expect(perms).not.toContain(Permission.JOIN_BUSINESS)
    })
  })

  it("uses null business context by default", () => {
    const perms = resolvePermissions(userActor)
    expect(perms).toContain(Permission.JOIN_BUSINESS)
    expect(perms).not.toContain(Permission.PAYMENT_REQUEST_CREATE)
  })
})

describe("hasPermission", () => {
  it("returns true when actor has the permission", () => {
    expect(hasPermission(userActor, Permission.SEND_TOKEN)).toBe(true)
  })

  it("returns false when actor lacks the permission", () => {
    expect(hasPermission(userActor, Permission.MEMBER_LIST, noBusinessCtx)).toBe(false)
  })

  it("returns true for owner-only permission when owner", () => {
    expect(hasPermission(userActor, Permission.REFUND_REVIEW, ownerCtx)).toBe(true)
  })

  it("returns false for owner-only permission when non-owner member", () => {
    expect(hasPermission(userActor, Permission.REFUND_REVIEW, memberCtx)).toBe(false)
  })

  it("returns true for JOIN_BUSINESS when no business context", () => {
    expect(hasPermission(userActor, Permission.JOIN_BUSINESS, noBusinessCtx)).toBe(true)
  })

  it("returns false for JOIN_BUSINESS when already in a business", () => {
    expect(hasPermission(userActor, Permission.JOIN_BUSINESS, ownerCtx)).toBe(false)
  })

  it("throws for agent actor", () => {
    expect(() => hasPermission(agentActor, Permission.SEND_TOKEN)).toThrow()
  })
})
