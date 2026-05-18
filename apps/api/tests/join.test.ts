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

const memberState: {
  member: Record<string, unknown> | null
} = { member: null }

vi.mock("@walty/db", () => ({
  db: {
    query: {
      businessMembers: {
        findFirst: vi.fn(async () => memberState.member),
      },
      users: { findFirst: vi.fn(async () => ({ email: "x@example.com" })) },
      businessSettings: { findFirst: vi.fn(async () => null) },
    },
    update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
  },
  businessMembers: {},
  businessSettings: {},
  users: {},
}))

let createApp: typeof import("../src/app.js").createApp

beforeAll(async () => {
  ;({ createApp } = await import("../src/app.js"))
})

afterAll(() => vi.restoreAllMocks())

describe("join routes", () => {
  it("GET /join/:token returns 404 when not found", async () => {
    memberState.member = null
    const app = createApp()
    const res = await request(app).get("/join/nope")
    expect(res.status).toBe(404)
  })

  it("GET /join/:token returns revoked status", async () => {
    memberState.member = {
      id: 1,
      businessId: 2,
      role: "cashier",
      status: "revoked",
      inviteEmail: null,
      expiresAt: new Date(Date.now() + 1_000_000),
      invitedBy: 1,
      userId: null,
    }
    const app = createApp()
    const res = await request(app).get("/join/tok")
    expect(res.status).toBe(200)
    expect(res.body.status).toBe("revoked")
  })

  it("GET /join/:token returns expired when past expiry", async () => {
    memberState.member = {
      id: 1,
      businessId: 2,
      role: "cashier",
      status: "invited",
      inviteEmail: null,
      expiresAt: new Date(Date.now() - 1_000),
      invitedBy: 1,
      userId: null,
    }
    const app = createApp()
    const res = await request(app).get("/join/tok")
    expect(res.status).toBe(200)
    expect(res.body.status).toBe("expired")
  })

  it("POST /join/:token requires auth", async () => {
    const app = createApp()
    const res = await request(app).post("/join/tok")
    expect(res.status).toBe(401)
  })
})
