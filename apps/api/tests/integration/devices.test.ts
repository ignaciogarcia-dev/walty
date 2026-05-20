import request from "supertest"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { beforeEach, describe, expect, it } from "vitest"
import { signSessionToken } from "@walty/shared/auth/session-token"
import { createApp } from "../../src/app.js"

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
