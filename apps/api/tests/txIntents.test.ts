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

const inserted: Array<Record<string, unknown>> = []

vi.mock("@walty/db", () => ({
  db: {
    query: {
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
        where: () => ({
          limit: async () => [],
          orderBy: () => ({ limit: async () => [] }),
        }),
      }),
    }),
    insert: vi.fn(() => ({
      values: (v: Record<string, unknown>) => ({
        returning: async () => {
          const row = { id: "intent-1", status: "pending", ...v }
          inserted.push(row)
          return [row]
        },
      }),
    })),
    update: vi.fn(() => ({
      set: () => ({ where: () => ({ returning: async () => [] }) }),
    })),
  },
  txIntents: {
    id: "id",
    userId: "userId",
    status: "status",
    idempotencyKey: "idempotencyKey",
    createdAt: "createdAt",
  },
  deviceSessions: {},
}))

vi.mock("@walty/shared/tx-intents/validate", () => ({
  validateAndNormalizePayload: vi.fn(),
}))

vi.mock("@walty/shared/tx-intents/expire", () => ({
  expireIfStale: vi.fn(async () => false),
  assertNotExpired: vi.fn(async () => {}),
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

const validPayload = {
  to: "0x" + "1".repeat(40),
  from: "0x" + "2".repeat(40),
  amount: "1.5",
  chainId: 137,
  token: {
    symbol: "USDC",
    address: "0x" + "3".repeat(40),
    type: "erc20",
    decimals: 6,
  },
}

describe("tx-intents routes", () => {
  it("POST /tx-intents requires auth", async () => {
    const app = createApp()
    const res = await request(app).post("/tx-intents").send({})
    expect(res.status).toBe(401)
  })

  it("POST /tx-intents rejects missing payload", async () => {
    const app = createApp()
    const res = await request(app)
      .post("/tx-intents")
      .set("Cookie", authed())
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("validation_error")
  })

  it("POST /tx-intents creates intent with payload", async () => {
    const app = createApp()
    const res = await request(app)
      .post("/tx-intents")
      .set("Cookie", authed())
      .send({
        payload: validPayload,
        type: "transfer",
      })
    expect(res.status).toBe(200)
    expect(res.body.id).toBe("intent-1")
    expect(res.body.status).toBe("pending")
  })

  it("POST /tx-intents rejects a structurally-invalid payload", async () => {
    const app = createApp()
    const { to, ...noTo } = validPayload
    const res = await request(app)
      .post("/tx-intents")
      .set("Cookie", authed())
      .send({ payload: noTo, type: "transfer" })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("validation_error")
  })

  it("POST /tx-intents rejects an unknown intent type", async () => {
    const app = createApp()
    const res = await request(app)
      .post("/tx-intents")
      .set("Cookie", authed())
      .send({ payload: validPayload, type: "bogus" })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("validation_error")
  })

  it("POST /tx-intents/:id/sign rejects malformed signedRaw", async () => {
    const app = createApp()
    const res = await request(app)
      .post("/tx-intents/intent-1/sign")
      .set("Cookie", authed())
      .send({ signedRaw: "not-hex" })
    expect(res.status).toBe(400)
  })

  it("PATCH /tx-intents/:id rejects invalid status", async () => {
    const app = createApp()
    const res = await request(app)
      .patch("/tx-intents/intent-1")
      .set("Cookie", authed())
      .send({ status: "weird" })
    expect(res.status).toBe(400)
  })
})
