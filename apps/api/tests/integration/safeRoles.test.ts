import request from "supertest"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createApp } from "../../src/app.js"

// ── Safe deploy mock (reused from treasury.test.ts) ───────────────────────────
vi.mock("../../src/lib/safe.js", () => ({
  predictSafeAddress: vi.fn(async () => "0x000000000000000000000000000000000000dEaD"),
  deploySafe: vi.fn(async () => ({
    safeAddress: "0x000000000000000000000000000000000000dEaD",
    txHash: "0xdeploy",
  })),
  getAdminAddress: vi.fn(() => "0x000000000000000000000000000000000000Ad1E"),
}))

// ── Admin signer mock ─────────────────────────────────────────────────────────
vi.mock("../../src/lib/adminSigner.js", () => ({
  getAdminAddress: vi.fn(() => "0x000000000000000000000000000000000000Ad1E"),
  getAdminWalletClient: vi.fn(() => ({
    account: { address: "0x000000000000000000000000000000000000Ad1E" },
    sendTransaction: vi.fn(async () => "0xsenttx"),
  })),
  getAdminPublicClient: vi.fn(() => ({
    waitForTransactionReceipt: vi.fn(async () => ({ status: "success", logs: [] })),
  })),
}))

// ── Zodiac Roles — partial mock: keep pure builders, override parseDeployedModifier ───
vi.mock("../../src/lib/zodiacRoles.js", async (importActual) => {
  const actual = await importActual<typeof import("../../src/lib/zodiacRoles.js")>()
  return {
    ...actual,
    parseDeployedModifier: vi.fn(
      () => "0x00000000000000000000000000000000000Faabb",
    ),
  }
})

// ── Safe protocol-kit mock ────────────────────────────────────────────────────
vi.mock("@safe-global/protocol-kit", () => {
  const mockSafeInstance = {
    createTransaction: vi.fn(async () => ({ data: "mockedTx" })),
    signTransaction: vi.fn(async (tx: unknown) => tx),
    executeTransaction: vi.fn(async () => ({ hash: "0xenable" })),
  }
  return {
    default: {
      init: vi.fn(async () => mockSafeInstance),
    },
  }
})

// ── Rate limiting no-op ───────────────────────────────────────────────────────
vi.mock("@walty/shared/rate-limit", () => ({
  rateLimitByIp: vi.fn(async () => {}),
  rateLimitByUser: vi.fn(async () => {}),
  RateLimitError: class RateLimitError extends Error {},
  cleanupExpiredEntries: vi.fn(async () => {}),
}))

// ─────────────────────────────────────────────────────────────────────────────

type App = ReturnType<typeof createApp>

const PASSWORD = "testpassword1234"
const VALID_OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
const VALID_MANAGER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

async function registerUser(app: App): Promise<string> {
  const reg = await request(app)
    .post("/auth/register")
    .send({ email: `dev-${Date.now()}-${Math.random()}@example.com`, password: PASSWORD })
  expect(reg.status).toBe(200)
  return (reg.headers["set-cookie"] as unknown as string[])[0]
}

async function deployTreasury(app: App, cookie: string): Promise<void> {
  const res = await request(app)
    .post("/treasury/deploy")
    .set("Cookie", cookie)
    .send({ ownerAddress: VALID_OWNER })
  expect(res.status).toBe(200)
  expect(res.body.treasury.status).toBe("deployed")
}

describe("Safe Roles routes (real db, mocked chain)", () => {
  let app: App

  beforeEach(() => {
    app = createApp()
  })

  // ── Test 1: setup with no deployed treasury returns error ─────────────────
  it("POST /treasury/roles/setup with no treasury returns an error (not 200)", async () => {
    const cookie = await registerUser(app)

    const res = await request(app)
      .post("/treasury/roles/setup")
      .set("Cookie", cookie)

    expect(res.status).not.toBe(200)
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  // ── Test 2: full setup on deployed treasury ───────────────────────────────
  it("POST /treasury/roles/setup after deploy → rolesStatus=scoped, addresses set", async () => {
    const cookie = await registerUser(app)
    await deployTreasury(app, cookie)

    const setup = await request(app)
      .post("/treasury/roles/setup")
      .set("Cookie", cookie)

    expect(setup.status).toBe(200)
    expect(setup.body.treasury.rolesStatus).toBe("scoped")
    expect(setup.body.treasury.rolesModifierAddress).toBeTruthy()
    expect(setup.body.treasury.managerCap).toBeTruthy()

    // Confirm via GET /treasury
    const get = await request(app).get("/treasury").set("Cookie", cookie)
    expect(get.status).toBe(200)
    expect(get.body.treasury.rolesStatus).toBe("scoped")
    expect(get.body.treasury.rolesModifierAddress).toBeTruthy()
    expect(get.body.treasury.managerCap).toBeTruthy()
  })

  // ── Test 3: idempotency — second setup call still returns scoped ──────────
  it("POST /treasury/roles/setup called twice is idempotent", async () => {
    const cookie = await registerUser(app)
    await deployTreasury(app, cookie)

    const first = await request(app)
      .post("/treasury/roles/setup")
      .set("Cookie", cookie)
    expect(first.status).toBe(200)
    expect(first.body.treasury.rolesStatus).toBe("scoped")

    const second = await request(app)
      .post("/treasury/roles/setup")
      .set("Cookie", cookie)
    expect(second.status).toBe(200)
    expect(second.body.treasury.rolesStatus).toBe("scoped")
  })

  // ── Test 4: managers POST with invalid address returns 400 ────────────────
  it("POST /treasury/roles/managers with invalid managerAddress returns 400", async () => {
    const cookie = await registerUser(app)
    await deployTreasury(app, cookie)

    await request(app).post("/treasury/roles/setup").set("Cookie", cookie)

    const res = await request(app)
      .post("/treasury/roles/managers")
      .set("Cookie", cookie)
      .send({ managerAddress: "nope" })

    expect(res.status).toBe(400)
  })

  // ── Test 5: managers POST with valid address after setup returns 200 ──────
  it("POST /treasury/roles/managers with valid address after setup returns 200 ok", async () => {
    const cookie = await registerUser(app)
    await deployTreasury(app, cookie)

    const setup = await request(app)
      .post("/treasury/roles/setup")
      .set("Cookie", cookie)
    expect(setup.status).toBe(200)

    const assign = await request(app)
      .post("/treasury/roles/managers")
      .set("Cookie", cookie)
      .send({ managerAddress: VALID_MANAGER })

    expect(assign.status).toBe(200)
    expect(assign.body.ok).toBe(true)
  })
})
