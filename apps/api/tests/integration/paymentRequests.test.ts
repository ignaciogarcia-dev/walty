import request from "supertest"
import { describe, expect, it } from "vitest"

import { db, addresses, businessSettings } from "@walty/db"
import { createApp } from "../../src/app.js"

// Polygon USDC.
const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"
const MERCHANT_WALLET = "0xabcdef0123456789abcdef0123456789abcdef01"

async function registerOwner(app: ReturnType<typeof createApp>) {
  const email = `pr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
  const reg = await request(app)
    .post("/auth/register")
    .send({ email, password: "testpassword1234" })
  const cookie = (reg.headers["set-cookie"] as unknown as string[])[0]
  const sess = await request(app).get("/session").set("Cookie", cookie)
  return { cookie, userId: sess.body.user.id as number }
}

async function seedOwnerBusiness(userId: number) {
  await db
    .insert(businessSettings)
    .values({ userId, name: "Acme" })
    .onConflictDoNothing()
  await db.insert(addresses).values({ userId, address: MERCHANT_WALLET })
}

describe("POST /payment-requests guards (real db)", () => {
  it("rejects an amount above PAYMENT_MAX_AMOUNT_USD", async () => {
    const app = createApp()
    const { cookie, userId } = await registerOwner(app)
    await seedOwnerBusiness(userId)

    const res = await request(app)
      .post("/payment-requests")
      .set("Cookie", cookie)
      .send({
        amountUsd: "5000000",
        token: "USDC",
        merchantWalletAddress: MERCHANT_WALLET,
      })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("amount exceeds maximum allowed")
  })

  it("rejects scientific-notation amounts (parseUnits would throw)", async () => {
    const app = createApp()
    const { cookie, userId } = await registerOwner(app)
    await seedOwnerBusiness(userId)

    const res = await request(app)
      .post("/payment-requests")
      .set("Cookie", cookie)
      .send({
        amountUsd: "1e3",
        token: "USDC",
        merchantWalletAddress: MERCHANT_WALLET,
      })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("amount format is invalid")
  })

  it("accepts a valid amount within the cap and precision", async () => {
    const app = createApp()
    const { cookie, userId } = await registerOwner(app)
    await seedOwnerBusiness(userId)

    const res = await request(app)
      .post("/payment-requests")
      .set("Cookie", cookie)
      .send({
        amountUsd: "9.50",
        token: "USDC",
        merchantWalletAddress: MERCHANT_WALLET,
      })
    expect(res.status).toBe(200)
    expect(res.body.amountUsd).toBe("9.50")
    expect(res.body.amountToken).toBe("9500000")
  })
})
