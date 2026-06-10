import { describe, expect, it } from "vitest"
import {
  paymentRequestCancelBody,
  paymentRequestCreateBody,
} from "./schemas"

const ADDR = "0x" + "a".repeat(40)

const validCreate = {
  amountUsd: "10.00",
  token: "USDC",
  merchantWalletAddress: ADDR,
}

describe("paymentRequestCreateBody", () => {
  it("accepts a minimal valid body", () => {
    expect(() => paymentRequestCreateBody.parse(validCreate)).not.toThrow()
  })

  it("accepts an optional isSplitPayment flag", () => {
    const parsed = paymentRequestCreateBody.parse({
      ...validCreate,
      isSplitPayment: true,
    })
    expect(parsed.isSplitPayment).toBe(true)
  })

  it("rejects an empty amount (structural; numeric range is semantic)", () => {
    expect(() =>
      paymentRequestCreateBody.parse({ ...validCreate, amountUsd: "" }),
    ).toThrow()
  })

  it("rejects a missing token", () => {
    const { token, ...rest } = validCreate
    expect(() => paymentRequestCreateBody.parse(rest)).toThrow()
  })

  it("rejects a malformed merchant wallet address", () => {
    expect(() =>
      paymentRequestCreateBody.parse({
        ...validCreate,
        merchantWalletAddress: "0xabc",
      }),
    ).toThrow()
  })

  it("strips unknown keys", () => {
    const parsed = paymentRequestCreateBody.parse({ ...validCreate, evil: 1 })
    expect(parsed).not.toHaveProperty("evil")
  })
})

describe("paymentRequestCancelBody", () => {
  it("accepts an id", () => {
    expect(paymentRequestCancelBody.parse({ id: "abc" }).id).toBe("abc")
  })

  it("rejects a missing id", () => {
    expect(() => paymentRequestCancelBody.parse({})).toThrow()
  })
})
