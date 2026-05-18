import { describe, expect, it } from "vitest"
import { canTransition } from "./RefundStateMachine"

describe("RefundStateMachine", () => {
  it("allows approve from pending", () => {
    const decision = canTransition("pending", {
      type: "approve",
      approver: "user1",
    })
    expect(decision.allowed).toBe(true)
    expect(decision.nextStatus).toBe("approved")
  })

  it("allows reject from pending", () => {
    const decision = canTransition("pending", {
      type: "reject",
      reason: "error",
    })
    expect(decision.allowed).toBe(true)
    expect(decision.nextStatus).toBe("rejected")
  })

  it("allows sign from approved", () => {
    const decision = canTransition("approved", {
      type: "sign",
      txHash: "0x123",
    })
    expect(decision.allowed).toBe(true)
    expect(decision.nextStatus).toBe("approved_pending_signature")
  })

  it("allows execute from approved_pending_signature", () => {
    const decision = canTransition("approved_pending_signature", {
      type: "execute",
    })
    expect(decision.allowed).toBe(true)
    expect(decision.nextStatus).toBe("executed")
  })

  it("disallows state changes from executed", () => {
    const decision = canTransition("executed", {
      type: "approve",
      approver: "user1",
    })
    expect(decision.allowed).toBe(false)
  })

  it("disallows state changes from rejected", () => {
    const decision = canTransition("rejected", {
      type: "approve",
      approver: "user1",
    })
    expect(decision.allowed).toBe(false)
  })

  it("disallows invalid transitions", () => {
    const decision = canTransition("pending", {
      type: "execute",
    })
    expect(decision.allowed).toBe(false)
  })
})
