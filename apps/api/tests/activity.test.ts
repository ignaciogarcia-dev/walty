import request from "supertest"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

process.env.JWT_SECRET = "test-secret"
process.env.NODE_ENV = "test"

vi.mock("@walty/shared/rate-limit", () => ({
  rateLimitByIp: vi.fn(async () => {}),
  rateLimitByUser: vi.fn(async () => {}),
  RateLimitError: class RateLimitError extends Error {},
  cleanupExpiredEntries: vi.fn(async () => {}),
}))

vi.mock("@walty/shared/business/getBusinessContext", () => ({
  getBusinessContext: vi.fn(async () => ({
    businessId: 1,
    role: "owner",
    isOwner: true,
    walletAddress: null,
  })),
}))

vi.mock("@walty/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: async () => [] }),
    }),
  },
  paymentRequests: { merchantId: "merchantId" },
}))

let createApp: typeof import("../src/app.js").createApp
let signSessionToken: typeof import("@walty/shared/auth/session-token").signSessionToken

beforeAll(async () => {
  ;({ createApp } = await import("../src/app.js"))
  ;({ signSessionToken } = await import("@walty/shared/auth/session-token"))
})

afterAll(() => vi.restoreAllMocks())

function authed() {
  return `token=${signSessionToken({ userId: 1 })}`
}

describe("activity stats", () => {
  it("GET /activity/stats requires auth", async () => {
    const app = createApp()
    const res = await request(app).get("/activity/stats")
    expect(res.status).toBe(401)
  })

  it("GET /activity/stats returns zeroed stats for empty merchant", async () => {
    const app = createApp()
    const res = await request(app).get("/activity/stats").set("Cookie", authed())
    expect(res.status).toBe(200)
    expect(res.body.business.currentMonthSales).toEqual({ total: "0", count: 0 })
    expect(res.body.business.successRate).toBe(0)
    expect(res.body.business.salesChangePercent).toBe(0)
  })
})
