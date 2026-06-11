import request from "supertest"
import { describe, expect, it } from "vitest"
import { db, mpcKeys } from "@walty/db"
import { createApp } from "../../src/app.js"

describe("auth flow (real db)", () => {
  it("register → session → /business/settings → /business/context", async () => {
    const app = createApp()
    const email = `qa-${Date.now()}@example.com`
    const password = "testpassword1234"

    const reg = await request(app)
      .post("/auth/register")
      .send({ email, password })
    expect(reg.status).toBe(200)
    expect(reg.body.ok).toBe(true)
    const cookie = (reg.headers["set-cookie"] as unknown as string[])[0]
    expect(cookie).toMatch(/^token=/)

    const sess = await request(app).get("/session").set("Cookie", cookie)
    expect(sess.status).toBe(200)
    expect(sess.body.user.email).toBe(email)
    expect(sess.body.user.hasWallet).toBe(false)
    expect(sess.body.user.hasActiveBusiness).toBe(false)
    expect(sess.body.user.isOwner).toBe(true)

    await db.insert(mpcKeys).values({
      userId: sess.body.user.id,
      pubkey: "0x" + "11".repeat(33),
      address: "0x1111111111111111111111111111111111111111",
      status: "active",
    })

    const mpcSess = await request(app).get("/session").set("Cookie", cookie)
    expect(mpcSess.status).toBe(200)
    expect(mpcSess.body.user.hasWallet).toBe(true)

    const noBiz = await request(app)
      .get("/business/context")
      .set("Cookie", cookie)
    expect(noBiz.status).toBe(403)

    const settings = await request(app)
      .post("/business/settings")
      .set("Cookie", cookie)
      .send({ name: "QA Co" })
    expect(settings.status).toBe(200)

    const ctx = await request(app)
      .get("/business/context")
      .set("Cookie", cookie)
    expect(ctx.status).toBe(200)
    expect(ctx.body.businessName).toBe("QA Co")
    expect(ctx.body.isOwner).toBe(true)
  })

  it("rejects duplicate email", async () => {
    const app = createApp()
    const email = `dup-${Date.now()}@example.com`
    const password = "testpassword1234"

    const first = await request(app)
      .post("/auth/register")
      .send({ email, password })
    expect(first.status).toBe(200)

    const second = await request(app)
      .post("/auth/register")
      .send({ email, password })
    expect(second.status).toBe(409)
    expect(second.body.error).toBe("conflict")
  })

  it("login round-trip", async () => {
    const app = createApp()
    const email = `login-${Date.now()}@example.com`
    const password = "testpassword1234"

    await request(app).post("/auth/register").send({ email, password })

    const ok = await request(app).post("/auth/login").send({ email, password })
    expect(ok.status).toBe(200)
    const cookie = (ok.headers["set-cookie"] as unknown as string[])[0]
    expect(cookie).toMatch(/^token=/)

    const bad = await request(app)
      .post("/auth/login")
      .send({ email, password: "completelywrong123" })
    expect(bad.status).toBe(401)
  })
})
