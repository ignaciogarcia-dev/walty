import { describe, expect, it } from "vitest"
import { canReactivateMember, canDeleteInvitation } from "./business.policy"

describe("canReactivateMember", () => {
  it("allows reactivation of a suspended member", () => {
    expect(canReactivateMember({ status: "suspended" })).toEqual({ allowed: true })
  })

  it("denies reactivation of an active member", () => {
    expect(canReactivateMember({ status: "active" })).toEqual({
      allowed: false,
      reason: "member_not_suspended",
    })
  })

  it("denies reactivation of an invited member", () => {
    expect(canReactivateMember({ status: "invited" })).toEqual({
      allowed: false,
      reason: "member_not_suspended",
    })
  })

  it("denies reactivation of a revoked member", () => {
    expect(canReactivateMember({ status: "revoked" })).toEqual({
      allowed: false,
      reason: "member_not_suspended",
    })
  })
})

describe("canDeleteInvitation", () => {
  it("allows deletion of an invited member", () => {
    expect(canDeleteInvitation({ status: "invited" })).toEqual({ allowed: true })
  })

  it("denies deletion of an active member", () => {
    expect(canDeleteInvitation({ status: "active" })).toEqual({
      allowed: false,
      reason: "member_not_invited",
    })
  })

  it("denies deletion of a suspended member", () => {
    expect(canDeleteInvitation({ status: "suspended" })).toEqual({
      allowed: false,
      reason: "member_not_invited",
    })
  })

  it("denies deletion of a revoked member", () => {
    expect(canDeleteInvitation({ status: "revoked" })).toEqual({
      allowed: false,
      reason: "member_not_invited",
    })
  })
})
