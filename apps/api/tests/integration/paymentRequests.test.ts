import request from "supertest"
import { describe, expect, it } from "vitest"

import { db, addresses, businessSettings, posDevices } from "@walty/db"
import { createApp } from "../../src/app.js"
import { createPaymentRequestRecord } from "../../src/services/paymentRequestService.js"

// Polygon USDC.
const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"
const MERCHANT_WALLET = "0xabcdef0123456789abcdef0123456789abcdef01"
const POS_WALLET = "0x1111111111111111111111111111111111111111"

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

async function seedPosDevice(businessId: number) {
  const [device] = await db
    .insert(posDevices)
    .values({
      businessId,
      name: "POS 1",
      publicKey: "test-pos-public-key",
      derivationIndex: 0,
      walletAddress: POS_WALLET,
    })
    .returning()
  return device
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

// The owner's home "active collection" card is driven solely by
// GET /payment-requests. It must show only the owner's OWN active charge, never
// a POS terminal's or a cashier's — otherwise that charge hijacks the owner's
// collect flow and blocks them from creating their own.
describe("GET /payment-requests owner active card (real db)", () => {
  it("excludes a POS-created charge from the owner's active card", async () => {
    const app = createApp()
    const { cookie, userId } = await registerOwner(app)
    await seedOwnerBusiness(userId)
    const device = await seedPosDevice(userId)

    // POS charge: operatorId null (like an owner's) but posDeviceId set.
    await createPaymentRequestRecord({
      merchantId: userId,
      merchantWalletAddress: POS_WALLET,
      amountUsd: "5.00",
      token: "USDC",
      posDeviceId: device.id,
    })

    const res = await request(app)
      .get("/payment-requests")
      .set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body.request).toBe(null)
  })

  it("returns the owner's own active charge", async () => {
    const app = createApp()
    const { cookie, userId } = await registerOwner(app)
    await seedOwnerBusiness(userId)

    const created = await createPaymentRequestRecord({
      merchantId: userId,
      merchantWalletAddress: MERCHANT_WALLET,
      amountUsd: "7.25",
      token: "USDC",
    })

    const res = await request(app)
      .get("/payment-requests")
      .set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body.request).not.toBe(null)
    expect(res.body.request.id).toBe(created.id)
  })

  it("excludes a cashier-created charge from the owner's active card", async () => {
    const app = createApp()
    const { cookie, userId } = await registerOwner(app)
    await seedOwnerBusiness(userId)
    // A second registered user provides a valid users.id for operatorId.
    const cashier = await registerOwner(app)

    await createPaymentRequestRecord({
      merchantId: userId,
      merchantWalletAddress: MERCHANT_WALLET,
      amountUsd: "3.00",
      token: "USDC",
      operatorId: cashier.userId,
    })

    const res = await request(app)
      .get("/payment-requests")
      .set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body.request).toBe(null)
  })
})
