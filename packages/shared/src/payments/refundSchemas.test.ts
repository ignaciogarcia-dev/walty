import { describe, expect, it } from "vitest"
import { refundCreateBody, refundPatchBody } from "./refundSchemas"

const ADDR = "0x" + "b".repeat(40)

const validCreate = {
  paymentRequestId: "pr-1",
  destinationAddress: ADDR,
  reason: "customer returned item",
}

describe("refundCreateBody", () => {
  it("accepts a minimal valid body", () => {
    expect(() => refundCreateBody.parse(validCreate)).not.toThrow()
  })

  it("accepts optional override amounts as strings", () => {
    const parsed = refundCreateBody.parse({
      ...validCreate,
      amountToken: "1500000",
      amountUsd: "1.5",
    })
    expect(parsed.amountToken).toBe("1500000")
  })

  it("trims and requires a non-empty reason", () => {
    expect(() =>
      refundCreateBody.parse({ ...validCreate, reason: "   " }),
    ).toThrow()
  })

  it("rejects a missing paymentRequestId", () => {
    const { paymentRequestId, ...rest } = validCreate
    expect(() => refundCreateBody.parse(rest)).toThrow()
  })

  it("rejects a malformed destination address", () => {
    expect(() =>
      refundCreateBody.parse({ ...validCreate, destinationAddress: "0xabc" }),
    ).toThrow()
  })
})

describe("refundPatchBody", () => {
  it("accepts approve / reject / mark_executed", () => {
    expect(refundPatchBody.parse({ action: "approve" }).action).toBe("approve")
    expect(refundPatchBody.parse({ action: "reject" }).action).toBe("reject")
    expect(
      refundPatchBody.parse({ action: "mark_executed", txHash: "0x" + "1".repeat(64) })
        .action,
    ).toBe("mark_executed")
  })

  it("rejects an unknown action", () => {
    expect(() => refundPatchBody.parse({ action: "explode" })).toThrow()
  })

  it("allows txHash to be omitted (required-per-action is enforced downstream)", () => {
    expect(() => refundPatchBody.parse({ action: "approve" })).not.toThrow()
  })
})
