import request from "supertest"
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

process.env.JWT_SECRET = "test-secret"
process.env.NODE_ENV = "test"

vi.mock("@walty/shared/rate-limit", () => ({
  rateLimitByIp: vi.fn(async () => {}),
  rateLimitByUser: vi.fn(async () => {}),
  RateLimitError: class RateLimitError extends Error {},
  cleanupExpiredEntries: vi.fn(async () => {}),
}))

const sessionState = {
  row: null as Record<string, unknown> | null,
}

vi.mock("@walty/db", () => ({
  db: {
    query: {
      deviceSessions: { findFirst: vi.fn(async () => sessionState.row) },
    },
    select: () => ({ from: () => ({ where: async () => [] }) }),
  },
  deviceSessions: {},
  addresses: {},
}))

let createApp: typeof import("../src/app.js").createApp
let signSessionToken: typeof import("@walty/shared/auth/session-token").signSessionToken

beforeAll(async () => {
  ;({ createApp } = await import("../src/app.js"))
  ;({ signSessionToken } = await import("@walty/shared/auth/session-token"))
})

afterAll(() => vi.restoreAllMocks())

beforeEach(() => {
  sessionState.row = {
    id: "sid-1",
    userId: 1,
    trustedAt: new Date(),
    lastSeenAt: new Date(),
    revokedAt: null,
  }
})

function cookie(payload: { userId: number; sid?: string }) {
  return `token=${signSessionToken(payload)}`
}

// /addresses is a thin authed endpoint; we use it to exercise the gate.
describe("withAuth device-session gate", () => {
  it("401 without a token", async () => {
    const res = await request(createApp()).get("/addresses")
    expect(res.status).toBe(401)
  })

  it("401 for a malformed token", async () => {
    const res = await request(createApp())
      .get("/addresses")
      .set("Cookie", "token=not-a-jwt")
    expect(res.status).toBe(401)
  })

  it("401 for a legacy token without a sid", async () => {
    const res = await request(createApp())
      .get("/addresses")
      .set("Cookie", cookie({ userId: 1 }))
    expect(res.status).toBe(401)
  })

  it("401 when the session row is missing", async () => {
    sessionState.row = null
    const res = await request(createApp())
      .get("/addresses")
      .set("Cookie", cookie({ userId: 1, sid: "sid-1" }))
    expect(res.status).toBe(401)
  })

  it("401 when the session is revoked", async () => {
    sessionState.row = { ...sessionState.row, revokedAt: new Date() }
    const res = await request(createApp())
      .get("/addresses")
      .set("Cookie", cookie({ userId: 1, sid: "sid-1" }))
    expect(res.status).toBe(401)
  })

  it("200 for an active session", async () => {
    const res = await request(createApp())
      .get("/addresses")
      .set("Cookie", cookie({ userId: 1, sid: "sid-1" }))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ addresses: [] })
  })
})
