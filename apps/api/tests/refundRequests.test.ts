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

function thenableEmpty() {
  const arr: never[] = []
  return {
    limit: async () => arr,
    orderBy: () => ({ limit: async () => arr, offset: async () => arr }),
    then: (resolve: (v: never[]) => unknown) => resolve(arr),
  }
}

vi.mock("@walty/db", () => ({
  db: {
    query: {
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
        where: () => thenableEmpty(),
        innerJoin: () => ({
          leftJoin: () => ({
            where: () => ({ orderBy: async () => [] }),
          }),
        }),
      }),
    }),
    insert: vi.fn(() => ({
      values: () => ({ returning: async () => [{ id: 1 }] }),
    })),
    update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
  },
  businessMembers: {},
  deviceSessions: {},
  paymentRequests: {
    id: "id",
    merchantId: "merchantId",
    operatorId: "operatorId",
  },
  refundRequests: {
    id: "id",
    businessId: "businessId",
    status: "status",
    paymentRequestId: "paymentRequestId",
    requestedBy: "requestedBy",
    createdAt: "createdAt",
  },
  txIntents: {},
  users: {},
}))

let createApp: typeof import("../src/app.js").createApp
let signSessionToken: typeof import("@walty/shared/auth/session-token").signSessionToken

beforeAll(async () => {
  ;({ createApp } = await import("../src/app.js"))
  ;({ signSessionToken } = await import("@walty/shared/auth/session-token"))
})

afterAll(() => vi.restoreAllMocks())

function authed() {
  return `token=${signSessionToken({ userId: 1, sid: "test-sid" })}`
}

describe("refund-requests routes", () => {
  it("GET /business/refund-requests requires auth", async () => {
    const app = createApp()
    const res = await request(app).get("/business/refund-requests")
    expect(res.status).toBe(401)
  })

  it("GET /business/refund-requests returns empty list", async () => {
    const app = createApp()
    const res = await request(app)
      .get("/business/refund-requests")
      .set("Cookie", authed())
    expect(res.status).toBe(200)
    expect(res.body.refundRequests).toEqual([])
  })

  it("POST /business/refund-requests rejects missing paymentRequestId", async () => {
    const app = createApp()
    const res = await request(app)
      .post("/business/refund-requests")
      .set("Cookie", authed())
      .send({ destinationAddress: "0xabc", reason: "x" })
    expect(res.status).toBe(400)
  })

  it("PATCH /business/refund-requests/:id rejects unknown action", async () => {
    const app = createApp()
    const res = await request(app)
      .patch("/business/refund-requests/1")
      .set("Cookie", authed())
      .send({ action: "explode" })
    // Structural validation now rejects the bad action at the boundary (400)
    // before the refund is loaded — stricter than the old 404.
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("validation_error")
  })
})
