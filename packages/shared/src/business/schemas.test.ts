import { describe, expect, it } from "vitest"
import {
  businessSettingsBody,
  memberInviteBody,
  memberPatchBody,
} from "./schemas"

const ADDR = "0x" + "c".repeat(40)

describe("businessSettingsBody", () => {
  it("accepts and trims a 2-80 char name", () => {
    expect(businessSettingsBody.parse({ name: "  Acme  " }).name).toBe("Acme")
  })

  it("rejects a name shorter than 2 chars", () => {
    expect(() => businessSettingsBody.parse({ name: "A" })).toThrow()
  })

  it("rejects a name longer than 80 chars", () => {
    expect(() =>
      businessSettingsBody.parse({ name: "x".repeat(81) }),
    ).toThrow()
  })
})

describe("memberInviteBody", () => {
  const valid = { role: "cashier", walletAddress: ADDR, derivationIndex: 1 }

  it("accepts the cashier invite the client sends", () => {
    expect(() => memberInviteBody.parse(valid)).not.toThrow()
  })

  it("rejects a non-cashier role", () => {
    expect(() =>
      memberInviteBody.parse({ ...valid, role: "owner" }),
    ).toThrow()
  })

  it("rejects a derivationIndex below 1", () => {
    expect(() =>
      memberInviteBody.parse({ ...valid, derivationIndex: 0 }),
    ).toThrow()
  })

  it("rejects a malformed wallet address", () => {
    expect(() =>
      memberInviteBody.parse({ ...valid, walletAddress: "nope" }),
    ).toThrow()
  })

  it("accepts an optional inviteEmail and expiresInDays", () => {
    const parsed = memberInviteBody.parse({
      ...valid,
      inviteEmail: "cashier@example.com",
      expiresInDays: 14,
    })
    expect(parsed.inviteEmail).toBe("cashier@example.com")
    expect(parsed.expiresInDays).toBe(14)
  })
})

describe("memberPatchBody", () => {
  it("accepts each known action", () => {
    for (const action of ["change_role", "suspend", "revoke", "reactivate"]) {
      expect(() => memberPatchBody.parse({ action })).not.toThrow()
    }
  })

  it("accepts an optional role for change_role", () => {
    expect(
      memberPatchBody.parse({ action: "change_role", role: "cashier" }).role,
    ).toBe("cashier")
  })

  it("rejects an unknown action", () => {
    expect(() => memberPatchBody.parse({ action: "explode" })).toThrow()
  })
})
