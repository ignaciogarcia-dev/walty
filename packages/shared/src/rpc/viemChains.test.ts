import { describe, expect, it } from "vitest"
import { getViemChain } from "./viemChains.js"

describe("getViemChain", () => {
  it("resolves Polygon Amoy testnet (80002)", () => {
    const chain = getViemChain(80002)
    expect(chain.id).toBe(80002)
  })
})
