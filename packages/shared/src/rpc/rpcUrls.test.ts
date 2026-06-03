import { describe, expect, it } from "vitest"
import { getPublicUrls } from "../providers/rpc/public.js"

describe("getPublicUrls", () => {
  it("returns at least one URL for Amoy (80002)", () => {
    expect(getPublicUrls(80002).length).toBeGreaterThan(0)
  })
})
