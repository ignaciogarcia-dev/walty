import { describe, expect, it } from "vitest"
import { validateSendForm } from "./SendFormValidation"

describe("SendFormValidation", () => {
  const baseContext = {
    recipient: "0x1234567890123456789012345678901234567890",
    amount: "100",
    tokenSymbol: "USDC",
    tokenDecimals: 6,
    userBalance: BigInt(200_000_000),
    selectedChainId: 137,
  }

  it("validates valid send form", () => {
    const result = validateSendForm(baseContext)
    expect(result).toEqual({ type: "valid" })
  })

  it("rejects invalid recipient", () => {
    const result = validateSendForm({
      ...baseContext,
      recipient: "invalid",
    })
    expect(result.type).toBe("invalid-recipient")
  })

  it("rejects insufficient balance", () => {
    const result = validateSendForm({
      ...baseContext,
      amount: "300",
      userBalance: BigInt(200_000_000),
    })
    expect(result.type).toBe("insufficient-balance")
  })

  it("validates @username format", () => {
    const result = validateSendForm({
      ...baseContext,
      recipient: "@alice",
    })
    expect(result).toEqual({ type: "valid" })
  })

  it("rejects negative amount", () => {
    const result = validateSendForm({
      ...baseContext,
      amount: "-100",
    })
    expect(result.type).toBe("invalid-amount")
  })

  it("rejects zero amount", () => {
    const result = validateSendForm({
      ...baseContext,
      amount: "0",
    })
    expect(result.type).toBe("invalid-amount")
  })

  it("rejects empty recipient", () => {
    const result = validateSendForm({
      ...baseContext,
      recipient: "",
    })
    expect(result.type).toBe("invalid-recipient")
  })

  it("rejects missing token", () => {
    const result = validateSendForm({
      ...baseContext,
      tokenSymbol: "",
    })
    expect(result.type).toBe("invalid-token")
  })
})
