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

vi.mock("@walty/db", () => ({
  db: {
    query: {
      walletNonces: { findFirst: vi.fn() },
      walletBackups: { findFirst: vi.fn() },
      deviceSessions: {
        findFirst: vi.fn(async () => ({
          id: "test-sid",
          trustedAt: new Date(),
          lastSeenAt: new Date(),
          revokedAt: null,
        })),
      },
    },
    insert: vi.fn(() => ({
      values: () => ({
        onConflictDoUpdate: async () => undefined,
        returning: async () => [],
      }),
    })),
    delete: vi.fn(() => ({ where: async () => undefined })),
    select: () => ({ from: () => ({ where: async () => [] }) }),
  },
  addresses: {},
  deviceSessions: {},
  walletBackups: { userId: "userId" },
  walletNonces: {},
}))

let createApp: typeof import("../src/app.js").createApp
let signSessionToken: typeof import("@walty/shared/auth/session-token").signSessionToken

beforeAll(async () => {
  ;({ createApp } = await import("../src/app.js"))
  ;({ signSessionToken } = await import("@walty/shared/auth/session-token"))
})

afterAll(() => vi.restoreAllMocks())

function authedCookie() {
  const token = signSessionToken({ userId: 1, sid: "test-sid" })
  return `token=${token}`
}

describe("wallet routes", () => {
  it("rejects unauthenticated /wallet/nonce", async () => {
    const app = createApp()
    const res = await request(app).post("/wallet/nonce")
    expect(res.status).toBe(401)
  })

  it("POST /wallet/nonce returns a nonce when authed", async () => {
    const app = createApp()
    const res = await request(app)
      .post("/wallet/nonce")
      .set("Cookie", authedCookie())
    expect(res.status).toBe(200)
    expect(typeof res.body.nonce).toBe("string")
    expect(res.body.nonce).toHaveLength(32)
  })

  it("POST /wallet/backup rejects malformed payload", async () => {
    const app = createApp()
    const res = await request(app)
      .post("/wallet/backup")
      .set("Cookie", authedCookie())
      .send({ encryptedSeed: "abc" })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("validation_error")
  })

  it("GET /addresses requires auth", async () => {
    const app = createApp()
    const res = await request(app).get("/addresses")
    expect(res.status).toBe(401)
  })

  it("GET /addresses returns empty list when authed", async () => {
    const app = createApp()
    const res = await request(app).get("/addresses").set("Cookie", authedCookie())
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ addresses: [] })
  })
})
