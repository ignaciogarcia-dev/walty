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

function thenableEmpty() {
  const arr: never[] = []
  return {
    limit: async () => arr,
    orderBy: () => ({
      limit: async () => arr,
      offset: async () => arr,
    }),
    then: (resolve: (v: never[]) => unknown) => resolve(arr),
  }
}

vi.mock("@walty/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => thenableEmpty(),
      }),
    }),
    insert: vi.fn(() => ({ values: async () => undefined })),
    update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
  },
  addresses: { userId: "userId", address: "address" },
  transactions: {
    userId: "userId",
    hash: "hash",
    id: "id",
    chainId: "chainId",
    createdAt: "createdAt",
  },
  txIntents: { userId: "userId", status: "status", createdAt: "createdAt" },
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

describe("tx routes", () => {
  it("POST /tx requires auth", async () => {
    const app = createApp()
    const res = await request(app).post("/tx").send({})
    expect(res.status).toBe(401)
  })

  it("POST /tx rejects missing hash", async () => {
    const app = createApp()
    const res = await request(app)
      .post("/tx")
      .set("Cookie", authed())
      .send({ chainId: 137, tokenSymbol: "USDC" })
    expect(res.status).toBe(400)
  })

  it("POST /tx accepts a valid record", async () => {
    const app = createApp()
    const res = await request(app)
      .post("/tx")
      .set("Cookie", authed())
      .send({
        hash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        chainId: 137,
        tokenSymbol: "USDC",
        from: "0xabc",
        to: "0xdef",
      })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it("GET /tx/activity returns empty when user has no addresses", async () => {
    const app = createApp()
    const res = await request(app).get("/tx/activity").set("Cookie", authed())
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ items: [], total: 0 })
  })

  it("POST /tx/scan-incoming returns 410", async () => {
    const app = createApp()
    const res = await request(app).post("/tx/scan-incoming").set("Cookie", authed())
    expect(res.status).toBe(410)
  })
})
