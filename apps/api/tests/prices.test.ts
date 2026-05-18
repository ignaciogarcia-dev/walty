import request from "supertest"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("@walty/shared/providers/pricing/pricingRouter", () => ({
  getPrices: vi.fn(async (ids: string[]) => {
    const out: Record<string, number> = {}
    for (const id of ids) out[id] = 1.23
    return out
  }),
}))

let createApp: typeof import("../src/app.js").createApp

beforeAll(async () => {
  ;({ createApp } = await import("../src/app.js"))
})

afterAll(() => vi.restoreAllMocks())

describe("prices route", () => {
  it("GET /prices returns symbol→price map", async () => {
    const app = createApp()
    const res = await request(app).get("/prices")
    expect(res.status).toBe(200)
    expect(typeof res.body).toBe("object")
    expect(Object.keys(res.body).length).toBeGreaterThan(0)
  })

  it("caches subsequent requests", async () => {
    const { getPrices } = await import(
      "@walty/shared/providers/pricing/pricingRouter"
    )
    const app = createApp()
    await request(app).get("/prices")
    const before = (getPrices as ReturnType<typeof vi.fn>).mock.calls.length
    await request(app).get("/prices")
    const after = (getPrices as ReturnType<typeof vi.fn>).mock.calls.length
    expect(after).toBe(before)
  })
})
