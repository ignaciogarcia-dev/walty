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
  user: null as { id: number; email: string; passwordHash: string } | null,
}

vi.mock("@walty/db", () => {
  const select = () => ({
    from: () => ({
      where: () => ({
        limit: () =>
          Promise.resolve(
            mockState.user
              ? [{ id: mockState.user.id, passwordHash: mockState.user.passwordHash }]
              : [],
          ),
      }),
    }),
  })

  return {
    db: {
      select,
      query: {
        users: {
          findFirst: vi.fn(async () => null),
        },
      },
      insert: vi.fn(() => ({
        values: () => ({
          returning: async () => [{ id: 99 }],
        }),
      })),
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn({})),
    },
    users: {},
    businessMembers: {},
    businessSettings: {},
    mpcKeys: {},
  }
})

let createApp: typeof import("../src/app.js").createApp

beforeAll(async () => {
  ;({ createApp } = await import("../src/app.js"))
})

afterAll(() => vi.restoreAllMocks())

beforeEach(() => {
  mockState.user = null
})

describe("auth routes", () => {
  it("POST /auth/login returns 401 for unknown email", async () => {
    const app = createApp()
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "nobody@example.com", password: "longenough" })
    expect(res.status).toBe(401)
    expect(res.body.error).toBe("unauthorized")
  })

  it("POST /auth/login rejects malformed email without DB lookup", async () => {
    const app = createApp()
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "not-an-email", password: "longenough" })
    expect(res.status).toBe(401)
  })

  it("POST /auth/logout clears cookie", async () => {
    const app = createApp()
    const res = await request(app).post("/auth/logout")
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    const setCookie = res.headers["set-cookie"]?.[0] ?? ""
    expect(setCookie).toMatch(/^token=;/)
    expect(setCookie).toMatch(/Max-Age=0/)
  })

  it("POST /auth/register validates password length", async () => {
    const app = createApp()
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "new@example.com", password: "short" })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("validation_error")
  })
})
