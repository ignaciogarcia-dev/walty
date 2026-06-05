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
  getBusinessContext: vi.fn(async (userId: number) =>
    userId === 1
      ? { businessId: 1, role: "owner", isOwner: true, walletAddress: null }
      : null,
  ),
}))

vi.mock("@walty/shared/business/operatorBalance", () => ({
  getOperatorTokenBalances: vi.fn(async () => ({ USDC: 0n, USDT: 0n })),
  operatorHasBalance: vi.fn(async () => false),
  getOperatorSingleTokenBalance: vi.fn(async () => 0n),
}))

vi.mock("@walty/shared/business/mpcStatus", () => ({
  getActiveMpcKey: vi.fn(async () => null),
  isMpcBusiness: vi.fn(async () => false),
}))

vi.mock("@walty/db", () => ({
  db: {
    query: {
      businessSettings: { findFirst: vi.fn(async () => ({ name: "Acme" })) },
      users: { findFirst: vi.fn(async () => ({ email: "owner@example.com" })) },
      businessMembers: { findFirst: vi.fn(async () => null) },
      deviceSessions: {
        findFirst: vi.fn(async () => ({
          id: "test-sid",
          trustedAt: new Date(),
          lastSeenAt: new Date(),
          revokedAt: null,
        })),
      },
    },
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => ({ orderBy: async () => [] }),
        }),
        where: () => ({
          limit: async () => [],
          orderBy: async () => [],
        }),
      }),
    }),
    insert: vi.fn(() => ({
      values: () => ({
        onConflictDoUpdate: async () => undefined,
        returning: async () => [],
      }),
    })),
    update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
    delete: vi.fn(() => ({ where: async () => undefined })),
  },
  addresses: {},
  businessMembers: { businessId: "businessId", derivationIndex: "derivationIndex" },
  businessSettings: { userId: "userId" },
  deviceSessions: {},
  users: {},
}))

let createApp: typeof import("../src/app.js").createApp
let signSessionToken: typeof import("@walty/shared/auth/session-token").signSessionToken

beforeAll(async () => {
  ;({ createApp } = await import("../src/app.js"))
  ;({ signSessionToken } = await import("@walty/shared/auth/session-token"))
})

afterAll(() => vi.restoreAllMocks())

function authedCookie(userId = 1) {
  return `token=${signSessionToken({ userId, sid: "test-sid" })}`
}

describe("business routes", () => {
  it("GET /business/context returns 401 without auth", async () => {
    const app = createApp()
    const res = await request(app).get("/business/context")
    expect(res.status).toBe(401)
  })

  it("GET /business/context returns 403 when no business", async () => {
    const app = createApp()
    const res = await request(app)
      .get("/business/context")
      .set("Cookie", authedCookie(2))
    expect(res.status).toBe(403)
  })

  it("GET /business/context returns owner context", async () => {
    const app = createApp()
    const res = await request(app)
      .get("/business/context")
      .set("Cookie", authedCookie(1))
    expect(res.status).toBe(200)
    expect(res.body.isOwner).toBe(true)
    expect(res.body.businessId).toBe(1)
    expect(res.body.businessName).toBe("Acme")
  })

  it("POST /business/settings rejects short name", async () => {
    const app = createApp()
    const res = await request(app)
      .post("/business/settings")
      .set("Cookie", authedCookie(1))
      .send({ name: "A" })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("validation_error")
  })
})
