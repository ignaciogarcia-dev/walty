import request from "supertest"
import { eq } from "drizzle-orm"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { db, devicePairingRequests } from "@walty/db"
import { signSessionToken } from "@walty/shared/auth/session-token"
import { createApp } from "../../src/app.js"
import { expireStalePairings } from "../../src/services/deviceSessions.js"

// Rate limiting is not under test here (auth.test covers it) and its per-user
// counter is shared across endpoints, so the multi-step pairing flow would
// trip it. No-op it so these tests exercise only the device/pairing logic.
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

async function nonce(app: App, cookie: string): Promise<string> {
  const res = await request(app).post("/wallet/nonce").set("Cookie", cookie)
  expect(res.status).toBe(200)
  return res.body.nonce as string
}

async function linkWallet(
  app: App,
  cookie: string,
  account: ReturnType<typeof privateKeyToAccount>,
): Promise<void> {
  const n = await nonce(app, cookie)
  const signature = await account.signMessage({
    message: `Link wallet ${account.address} nonce ${n}`,
  })
  const res = await request(app)
    .post("/wallet/link")
    .set("Cookie", cookie)
    .send({ address: account.address, signature, nonce: n })
  expect(res.status).toBe(200)
}

async function currentDevice(app: App, cookie: string) {
  const res = await request(app).get("/devices").set("Cookie", cookie)
  expect(res.status).toBe(200)
  return res.body.devices.find(
    (d: { current: boolean }) => d.current,
  ) as { id: string; trusted: boolean }
}

async function attest(
  app: App,
  cookie: string,
  account: ReturnType<typeof privateKeyToAccount>,
): Promise<void> {
  const { id: sid } = await currentDevice(app, cookie)
  const n = await nonce(app, cookie)
  const signature = await account.signMessage({
    message: `Attest device ${sid} nonce ${n}`,
  })
  const res = await request(app)
    .post("/devices/attest")
    .set("Cookie", cookie)
    .send({ nonce: n, signature })
  expect(res.status).toBe(200)
}

// Registers a user, links + attests a wallet → returns a trusted device cookie
// plus the wallet account and that user's email (for a second login).
async function trustedOwner(app: App): Promise<{
  cookie: string
  account: ReturnType<typeof privateKeyToAccount>
  email: string
}> {
  const cookie = await registerUser(app)
  const email = (await request(app).get("/session").set("Cookie", cookie)).body
    .user.email
  const account = privateKeyToAccount(generatePrivateKey())
  await linkWallet(app, cookie, account)
  await attest(app, cookie, account)
  return { cookie, account, email }
}

async function loginCookie(app: App, email: string): Promise<string> {
  const res = await request(app)
    .post("/auth/login")
    .send({ email, password: PASSWORD })
  expect(res.status).toBe(200)
  return (res.headers["set-cookie"] as unknown as string[])[0]
}

describe("device sessions (real db)", () => {
  let app: App
  beforeEach(() => {
    app = createApp()
  })

  it("a fresh session is untrusted until it attests", async () => {
    const cookie = await registerUser(app)
    const dev = await currentDevice(app, cookie)
    expect(dev.trusted).toBe(false)
  })

  it("attest with a valid wallet signature marks the session trusted", async () => {
    const cookie = await registerUser(app)
    const account = privateKeyToAccount(generatePrivateKey())
    await linkWallet(app, cookie, account)

    const { id: sid } = await currentDevice(app, cookie)
    const n = await nonce(app, cookie)
    const signature = await account.signMessage({
      message: `Attest device ${sid} nonce ${n}`,
    })

    const res = await request(app)
      .post("/devices/attest")
      .set("Cookie", cookie)
      .send({ nonce: n, signature })
    expect(res.status).toBe(200)
    expect(res.body.trusted).toBe(true)

    const after = await currentDevice(app, cookie)
    expect(after.trusted).toBe(true)
  })

  it("attest with a signature from another key is rejected", async () => {
    const cookie = await registerUser(app)
    const owner = privateKeyToAccount(generatePrivateKey())
    await linkWallet(app, cookie, owner)

    const { id: sid } = await currentDevice(app, cookie)
    const n = await nonce(app, cookie)
    const attacker = privateKeyToAccount(generatePrivateKey())
    const signature = await attacker.signMessage({
      message: `Attest device ${sid} nonce ${n}`,
    })

    const res = await request(app)
      .post("/devices/attest")
      .set("Cookie", cookie)
      .send({ nonce: n, signature })
    expect(res.status).toBe(403)

    const after = await currentDevice(app, cookie)
    expect(after.trusted).toBe(false)
  })

  it("revoking a session makes its next request 401", async () => {
    const cookieA = await registerUser(app)
    // Re-login from the same account = a second device session.
    const email = (await request(app).get("/session").set("Cookie", cookieA))
      .body.user.email
    const loginB = await request(app)
      .post("/auth/login")
      .send({ email, password: PASSWORD })
    const cookieB = (loginB.headers["set-cookie"] as unknown as string[])[0]

    const bDevice = await currentDevice(app, cookieB)
    const list = await request(app).get("/devices").set("Cookie", cookieA)
    expect(list.body.devices).toHaveLength(2)

    const revoke = await request(app)
      .post(`/devices/${bDevice.id}/revoke`)
      .set("Cookie", cookieA)
    expect(revoke.status).toBe(200)

    const afterB = await request(app).get("/devices").set("Cookie", cookieB)
    expect(afterB.status).toBe(401)
    // A still works and no longer lists the revoked session.
    const afterA = await request(app).get("/devices").set("Cookie", cookieA)
    expect(afterA.status).toBe(200)
    expect(afterA.body.devices).toHaveLength(1)
  })

  it("cannot revoke a session that belongs to another user", async () => {
    const cookieA = await registerUser(app)
    const cookieB = await registerUser(app)
    const bDevice = await currentDevice(app, cookieB)

    const res = await request(app)
      .post(`/devices/${bDevice.id}/revoke`)
      .set("Cookie", cookieA)
    expect(res.status).toBe(404)
    // B unaffected.
    const afterB = await request(app).get("/devices").set("Cookie", cookieB)
    expect(afterB.status).toBe(200)
  })

  it("rejects a legacy token without a sid (forces re-login)", async () => {
    const legacy = `token=${signSessionToken({ userId: 1 })}`
    const res = await request(app).get("/devices").set("Cookie", legacy)
    expect(res.status).toBe(401)
  })

  it("revocation applies to every authed route, not just /devices", async () => {
    const cookie = await registerUser(app)
    const { id: sid } = await currentDevice(app, cookie)
    await request(app).post(`/devices/${sid}/revoke`).set("Cookie", cookie)

    // A different authed endpoint must also reject the revoked session.
    const res = await request(app).get("/addresses").set("Cookie", cookie)
    expect(res.status).toBe(401)
  })

  it("re-login after revoking yields a fresh working session", async () => {
    const cookieA = await registerUser(app)
    const email = (await request(app).get("/session").set("Cookie", cookieA))
      .body.user.email
    const { id: sid } = await currentDevice(app, cookieA)

    await request(app).post(`/devices/${sid}/revoke`).set("Cookie", cookieA)
    expect(
      (await request(app).get("/devices").set("Cookie", cookieA)).status,
    ).toBe(401)

    const login = await request(app)
      .post("/auth/login")
      .send({ email, password: PASSWORD })
    const fresh = (login.headers["set-cookie"] as unknown as string[])[0]
    const after = await request(app).get("/devices").set("Cookie", fresh)
    expect(after.status).toBe(200)
    expect(after.body.devices).toHaveLength(1)
  })

  it("revoking your own current session logs you out", async () => {
    const cookie = await registerUser(app)
    const { id: sid } = await currentDevice(app, cookie)
    const revoke = await request(app)
      .post(`/devices/${sid}/revoke`)
      .set("Cookie", cookie)
    expect(revoke.status).toBe(200)
    const after = await request(app).get("/devices").set("Cookie", cookie)
    expect(after.status).toBe(401)
  })

  it("revoking an unknown session id is a 404", async () => {
    const cookie = await registerUser(app)
    const res = await request(app)
      .post("/devices/00000000-0000-0000-0000-000000000000/revoke")
      .set("Cookie", cookie)
    expect(res.status).toBe(404)
  })

  it("attest fails without a linked wallet", async () => {
    const cookie = await registerUser(app)
    const { id: sid } = await currentDevice(app, cookie)
    const n = await nonce(app, cookie)
    const account = privateKeyToAccount(generatePrivateKey())
    const signature = await account.signMessage({
      message: `Attest device ${sid} nonce ${n}`,
    })
    const res = await request(app)
      .post("/devices/attest")
      .set("Cookie", cookie)
      .send({ nonce: n, signature })
    expect(res.status).toBe(403)
  })

  it("attest rejects an unknown nonce", async () => {
    const cookie = await registerUser(app)
    const account = privateKeyToAccount(generatePrivateKey())
    await linkWallet(app, cookie, account)
    const { id: sid } = await currentDevice(app, cookie)
    const signature = await account.signMessage({
      message: `Attest device ${sid} nonce never-issued`,
    })
    const res = await request(app)
      .post("/devices/attest")
      .set("Cookie", cookie)
      .send({ nonce: "never-issued", signature })
    expect(res.status).toBe(400)
  })

  it("a trusted device renames its own label", async () => {
    const { cookie } = await trustedOwner(app)
    const { id: sid } = await currentDevice(app, cookie)
    const res = await request(app)
      .patch(`/devices/${sid}`)
      .set("Cookie", cookie)
      .send({ label: "Office laptop" })
    expect(res.status).toBe(200)
    const after = await request(app).get("/devices").set("Cookie", cookie)
    expect(after.body.devices[0].label).toBe("Office laptop")
  })

  it("a trusted device can rename a sibling session of the same user", async () => {
    const { cookie: owner, email } = await trustedOwner(app)
    const second = await loginCookie(app, email)
    const { id: secondSid } = await currentDevice(app, second)

    const res = await request(app)
      .patch(`/devices/${secondSid}`)
      .set("Cookie", owner)
      .send({ label: "  Old phone  " })
    expect(res.status).toBe(200)

    const list = await request(app).get("/devices").set("Cookie", owner)
    const target = list.body.devices.find(
      (d: { id: string }) => d.id === secondSid,
    )
    expect(target.label).toBe("Old phone")
  })

  it("an untrusted device cannot rename anything", async () => {
    const { email } = await trustedOwner(app)
    const second = await loginCookie(app, email)
    const { id: secondSid } = await currentDevice(app, second)
    const res = await request(app)
      .patch(`/devices/${secondSid}`)
      .set("Cookie", second)
      .send({ label: "Hacked" })
    expect(res.status).toBe(403)
  })

  it("cannot rename a device of another user (404)", async () => {
    const { cookie: a } = await trustedOwner(app)
    const { cookie: b } = await trustedOwner(app)
    const { id: bSid } = await currentDevice(app, b)
    const res = await request(app)
      .patch(`/devices/${bSid}`)
      .set("Cookie", a)
      .send({ label: "Stolen" })
    expect(res.status).toBe(404)
  })

  it("rejects an empty label or one longer than 80 chars", async () => {
    const { cookie } = await trustedOwner(app)
    const { id: sid } = await currentDevice(app, cookie)
    const empty = await request(app)
      .patch(`/devices/${sid}`)
      .set("Cookie", cookie)
      .send({ label: "   " })
    expect(empty.status).toBe(400)

    const tooLong = await request(app)
      .patch(`/devices/${sid}`)
      .set("Cookie", cookie)
      .send({ label: "x".repeat(81) })
    expect(tooLong.status).toBe(400)
  })

  it("a nonce is single-use across attest", async () => {
    const cookie = await registerUser(app)
    const account = privateKeyToAccount(generatePrivateKey())
    await linkWallet(app, cookie, account)
    const { id: sid } = await currentDevice(app, cookie)

    const n = await nonce(app, cookie)
    const sign = () =>
      account.signMessage({ message: `Attest device ${sid} nonce ${n}` })

    const first = await request(app)
      .post("/devices/attest")
      .set("Cookie", cookie)
      .send({ nonce: n, signature: await sign() })
    expect(first.status).toBe(200)

    const second = await request(app)
      .post("/devices/attest")
      .set("Cookie", cookie)
      .send({ nonce: n, signature: await sign() })
    expect(second.status).toBe(400)
  })
})

describe("device pairing gate (real db)", () => {
  let app: App
  beforeEach(() => {
    app = createApp()
  })

  async function approve(
    cookie: string,
    account: ReturnType<typeof privateKeyToAccount>,
    pairingId: string,
  ) {
    const n = await nonce(app, cookie)
    const signature = await account.signMessage({
      message: `Approve device pairing ${pairingId} nonce ${n}`,
    })
    return request(app)
      .post(`/devices/pairing-requests/${pairingId}/approve`)
      .set("Cookie", cookie)
      .send({ nonce: n, signature })
  }

  it("a trusted device pulls the backup without any pairing", async () => {
    const { cookie } = await trustedOwner(app)
    const res = await request(app).get("/wallet/backup").set("Cookie", cookie)
    expect(res.status).toBe(200)
  })

  it("an untrusted device is blocked from the backup until approved", async () => {
    const { cookie: owner, account, email } = await trustedOwner(app)
    const newDevice = await loginCookie(app, email)

    const blocked = await request(app)
      .get("/wallet/backup")
      .set("Cookie", newDevice)
    expect(blocked.status).toBe(403)
    expect(blocked.body.error).toBe("forbidden")

    const req = await request(app)
      .post("/devices/pairing-requests")
      .set("Cookie", newDevice)
    expect(req.status).toBe(200)

    const ok = await approve(owner, account, req.body.pairingId)
    expect(ok.status).toBe(200)

    const released = await request(app)
      .get("/wallet/backup")
      .set("Cookie", newDevice)
    expect(released.status).toBe(200)
  })

  it("an already-trusted device cannot open a pairing request", async () => {
    const { cookie } = await trustedOwner(app)
    const res = await request(app)
      .post("/devices/pairing-requests")
      .set("Cookie", cookie)
    expect(res.status).toBe(400)
  })

  it("an untrusted device cannot approve a pairing", async () => {
    const { email } = await trustedOwner(app)
    const newDevice = await loginCookie(app, email)
    const req = await request(app)
      .post("/devices/pairing-requests")
      .set("Cookie", newDevice)
    // The new (untrusted) device tries to approve its own pairing.
    const res = await request(app)
      .post(`/devices/pairing-requests/${req.body.pairingId}/approve`)
      .set("Cookie", newDevice)
      .send({ nonce: "x", signature: "0xdead" })
    expect(res.status).toBe(403)
  })

  it("approval needs a fresh wallet signature, not just a trusted session", async () => {
    const { cookie: owner, email } = await trustedOwner(app)
    const newDevice = await loginCookie(app, email)
    const req = await request(app)
      .post("/devices/pairing-requests")
      .set("Cookie", newDevice)

    // Owner is trusted but signs the approval with the wrong key.
    const attacker = privateKeyToAccount(generatePrivateKey())
    const bad = await approve(owner, attacker, req.body.pairingId)
    expect(bad.status).toBe(403)

    const stillBlocked = await request(app)
      .get("/wallet/backup")
      .set("Cookie", newDevice)
    expect(stillBlocked.status).toBe(403)
  })

  it("a rejected pairing leaves the backup blocked", async () => {
    const { cookie: owner, email } = await trustedOwner(app)
    const newDevice = await loginCookie(app, email)
    const req = await request(app)
      .post("/devices/pairing-requests")
      .set("Cookie", newDevice)

    const reject = await request(app)
      .post(`/devices/pairing-requests/${req.body.pairingId}/reject`)
      .set("Cookie", owner)
    expect(reject.status).toBe(200)

    const blocked = await request(app)
      .get("/wallet/backup")
      .set("Cookie", newDevice)
    expect(blocked.status).toBe(403)
  })

  it("expireStalePairings flips overdue pending requests to expired", async () => {
    const { email } = await trustedOwner(app)
    const newDevice = await loginCookie(app, email)
    const req = await request(app)
      .post("/devices/pairing-requests")
      .set("Cookie", newDevice)
    const pairingId = req.body.pairingId as string

    // Backdate the request so it is overdue.
    await db
      .update(devicePairingRequests)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(devicePairingRequests.id, pairingId))

    const expired = await expireStalePairings()
    expect(expired).toBeGreaterThanOrEqual(1)

    const row = await db.query.devicePairingRequests.findFirst({
      where: eq(devicePairingRequests.id, pairingId),
    })
    expect(row?.status).toBe("expired")
  })
})
