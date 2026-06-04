import request from "supertest"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createApp } from "../../src/app.js"
import { deploySafe } from "../../src/lib/safe.js"

vi.mock("../../src/lib/safe.js", () => ({
  predictSafeAddress: vi.fn(async () => "0x000000000000000000000000000000000000dEaD"),
  deploySafe: vi.fn(async () => ({
    safeAddress: "0x000000000000000000000000000000000000dEaD",
    txHash: "0xdeploy",
  })),
  getAdminAddress: vi.fn(() => "0x000000000000000000000000000000000000Ad1E"),
}))

// Rate limiting is not under test here; no-op it.
vi.mock("@walty/shared/rate-limit", () => ({
  rateLimitByIp: vi.fn(async () => {}),
  rateLimitByUser: vi.fn(async () => {}),
  RateLimitError: class RateLimitError extends Error {},
  cleanupExpiredEntries: vi.fn(async () => {}),
}))

type App = ReturnType<typeof createApp>

const PASSWORD = "testpassword1234"

async function registerUser(app: App): Promise<string> {
  const reg = await request(app)
    .post("/auth/register")
    .send({ email: `dev-${Date.now()}-${Math.random()}@example.com`, password: PASSWORD })
  expect(reg.status).toBe(200)
  return (reg.headers["set-cookie"] as unknown as string[])[0]
}

const VALID_OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

describe("treasury routes (real db, mocked Safe SDK)", () => {
  let app: App

  beforeEach(() => {
    app = createApp()
  })

  it("GET /treasury before any deploy returns 200 with null treasury", async () => {
    const cookie = await registerUser(app)
    const res = await request(app).get("/treasury").set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body.treasury).toBeNull()
  })

  it("POST /treasury/deploy with valid ownerAddress deploys and GET shows deployTxHash", async () => {
    const cookie = await registerUser(app)

    const deploy = await request(app)
      .post("/treasury/deploy")
      .set("Cookie", cookie)
      .send({ ownerAddress: VALID_OWNER })
    expect(deploy.status).toBe(200)
    expect(deploy.body.treasury.safeAddress).toBe(
      "0x000000000000000000000000000000000000dEaD",
    )
    expect(deploy.body.treasury.status).toBe("deployed")

    const get = await request(app).get("/treasury").set("Cookie", cookie)
    expect(get.status).toBe(200)
    expect(get.body.treasury.deployTxHash).toBe("0xdeploy")
  })

  it("POST /treasury/deploy with an invalid ownerAddress returns 400", async () => {
    const cookie = await registerUser(app)
    const res = await request(app)
      .post("/treasury/deploy")
      .set("Cookie", cookie)
      .send({ ownerAddress: "nope" })
    expect(res.status).toBe(400)
  })

  it("POST /treasury/deploy is idempotent — two calls return the same treasury id", async () => {
    const cookie = await registerUser(app)

    const first = await request(app)
      .post("/treasury/deploy")
      .set("Cookie", cookie)
      .send({ ownerAddress: VALID_OWNER })
    expect(first.status).toBe(200)

    const second = await request(app)
      .post("/treasury/deploy")
      .set("Cookie", cookie)
      .send({ ownerAddress: VALID_OWNER })
    expect(second.status).toBe(200)

    expect(first.body.treasury.id).toBe(second.body.treasury.id)
  })

  it("re-attempts deploy after a prior deploy failure (no stuck pending row)", async () => {
    const cookie = await registerUser(app)

    vi.mocked(deploySafe).mockRejectedValueOnce(new Error("RPC failure"))

    const first = await request(app)
      .post("/treasury/deploy")
      .set("Cookie", cookie)
      .send({ ownerAddress: VALID_OWNER })
    expect(first.status).toBe(500)

    const second = await request(app)
      .post("/treasury/deploy")
      .set("Cookie", cookie)
      .send({ ownerAddress: VALID_OWNER })
    expect(second.status).toBe(200)
    expect(second.body.treasury.status).toBe("deployed")
  })
})
