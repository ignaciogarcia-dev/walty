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

const mockState = {
  mpcKey: null as { id: string; status: string } | null,
}

vi.mock("@walty/db", () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn(async () => ({ id: 1, email: "owner@example.com" })),
      },
      businessSettings: {
        findFirst: vi.fn(async () => ({ name: "Owner Co" })),
      },
      businessMembers: {
        findMany: vi.fn(async () => []),
      },
      mpcKeys: {
        findFirst: vi.fn(async () => mockState.mpcKey),
      },
      deviceSessions: {
        findFirst: vi.fn(async () => ({
          id: "sid-1",
          userId: 1,
          trustedAt: new Date(),
          lastSeenAt: new Date(),
          revokedAt: null,
        })),
      },
    },
    select: () => ({ from: () => ({ where: async () => [] }) }),
  },
  users: { id: { name: "id" } },
  businessMembers: { userId: { name: "user_id" } },
  businessSettings: { userId: { name: "user_id" } },
  mpcKeys: { userId: { name: "user_id" } },
  deviceSessions: { id: { name: "id" } },
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
  mockState.mpcKey = null
})

function authedCookie() {
  const token = signSessionToken({ userId: 1, sid: "sid-1" })
  return `token=${token}`
}

describe("session routes", () => {
  it("reports no wallet when the owner has no active MPC key", async () => {
    const res = await request(createApp()).get("/session").set("Cookie", authedCookie())

    expect(res.status).toBe(200)
    expect(res.body.user.hasWallet).toBe(false)
  })

  it("reports no wallet while the MPC key is still pending DKG", async () => {
    mockState.mpcKey = { id: "key-1", status: "dkg_pending" }

    const res = await request(createApp()).get("/session").set("Cookie", authedCookie())

    expect(res.status).toBe(200)
    expect(res.body.user.hasWallet).toBe(false)
  })

  it("reports a wallet when the owner has an active MPC key", async () => {
    mockState.mpcKey = { id: "key-1", status: "active" }

    const res = await request(createApp()).get("/session").set("Cookie", authedCookie())

    expect(res.status).toBe(200)
    expect(res.body.user.hasWallet).toBe(true)
  })
})
