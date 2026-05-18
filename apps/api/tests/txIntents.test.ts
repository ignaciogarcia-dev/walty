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
  return `token=${signSessionToken({ userId: 1 })}`
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
        payload: { chainId: 137, foo: "bar" },
        type: "transfer",
      })
    expect(res.status).toBe(200)
    expect(res.body.id).toBe("intent-1")
    expect(res.body.status).toBe("pending")
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
