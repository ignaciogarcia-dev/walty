import request from "supertest"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

process.env.JWT_SECRET = "test-secret"
process.env.PAYMENTS_RECONCILE_SECRET = "shh"
process.env.INTERNAL_RECONCILE_SECRET = "psst"
process.env.WORKERS_ENABLED = "false"

vi.mock("@walty/shared/payments/reconcilePendingPaymentRequests", () => ({
  reconcilePendingPaymentRequests: vi.fn(async () => ({ paid: 1 })),
}))

vi.mock("@walty/shared/tx/reconcileIncomingTransfers", () => ({
  reconcileIncomingTransfers: vi.fn(async () => ({ scanned: 0 })),
}))

vi.mock("@walty/shared/rate-limit", () => ({
  rateLimitByIp: vi.fn(async () => {}),
  rateLimitByUser: vi.fn(async () => {}),
  RateLimitError: class RateLimitError extends Error {},
  cleanupExpiredEntries: vi.fn(async () => {}),
}))

vi.mock("@walty/db", () => ({
  db: {
    update: vi.fn(() => ({
      set: () => ({
        where: () => ({ returning: async () => [] }),
      }),
    })),
  },
  txIntents: { status: "status", updatedAt: "updatedAt", id: "id" },
}))

let createApp: typeof import("../src/app.js").createApp

beforeAll(async () => {
  ;({ createApp } = await import("../src/app.js"))
})

afterAll(() => vi.restoreAllMocks())

describe("internal routes", () => {
  it("POST /internal/payment-requests/reconcile rejects missing secret", async () => {
    const app = createApp()
    const res = await request(app).post("/internal/payment-requests/reconcile")
    expect(res.status).toBe(401)
  })

  it("POST /internal/payment-requests/reconcile runs with valid secret", async () => {
    const app = createApp()
    const res = await request(app)
      .post("/internal/payment-requests/reconcile")
      .set("x-reconcile-secret", "shh")
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.paid).toBe(1)
  })

  it("POST /internal/tx-intents/sweep requires its own secret", async () => {
    const app = createApp()
    const bad = await request(app).post("/internal/tx-intents/sweep")
    expect(bad.status).toBe(401)
    const ok = await request(app)
      .post("/internal/tx-intents/sweep")
      .set("x-internal-secret", "psst")
    expect(ok.status).toBe(200)
    expect(ok.body.reset).toBe(0)
  })

  it("POST /internal/tx/scan-incoming runs with reconcile secret", async () => {
    const app = createApp()
    const res = await request(app)
      .post("/internal/tx/scan-incoming")
      .set("x-reconcile-secret", "shh")
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})
