import request from "supertest"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  db,
  businessSettings,
  paymentRequests,
  refundRequests,
  txIntents,
  users,
} from "@walty/db"

// Polygon USDC.
const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"
// All-lowercase so viem's isAddress() skips checksum validation.
const MERCHANT_WALLET = "0xabcdef0123456789abcdef0123456789abcdef01"
const PAYER = "0xfedcba9876543210fedcba9876543210fedcba98"
const DESTINATION = "0x1234567890abcdef1234567890abcdef12345678"

// Stub verifyTransaction so mark_executed doesn't hit Polygon RPC.
const verifyMock = vi.fn(async () => ({ status: "confirmed" as const }))
vi.mock("@walty/shared/transactions/verify", () => ({
  verifyTransaction: () => verifyMock(),
  TxVerificationError: class TxVerificationError extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  },
}))

let createApp: typeof import("../../src/app.js").createApp

beforeAll(async () => {
  ;({ createApp } = await import("../../src/app.js"))
})

afterAll(() => vi.restoreAllMocks())

async function registerOwner(app: ReturnType<typeof createApp>) {
  const email = `mer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
  const reg = await request(app)
    .post("/auth/register")
    .send({ email, password: "testpassword1234" })
  const cookie = (reg.headers["set-cookie"] as unknown as string[])[0]
  const sess = await request(app).get("/session").set("Cookie", cookie)
  return { cookie, userId: sess.body.user.id as number }
}

async function seedPaidPayment(userId: number, amountToken = "10000000") {
  await db
    .insert(businessSettings)
    .values({ userId, name: "Acme" })
    .onConflictDoNothing()
  const now = new Date()
  const [pr] = await db
    .insert(paymentRequests)
    .values({
      merchantId: userId,
      chainId: 137,
      amountUsd: "10",
      amountToken,
      tokenSymbol: "USDC",
      tokenAddress: USDC,
      tokenDecimals: 6,
      merchantWalletAddress: MERCHANT_WALLET,
      startBlock: "1",
      lastScannedBlock: "1",
      requiredConfirmations: 1,
      confirmations: 1,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + 3600_000),
      status: "paid",
      paidAt: now,
      payerAddress: PAYER,
      receivedAmountToken: amountToken,
      txHash: "0xpaidpaymenttx",
    })
    .returning()
  return pr
}

describe("refund requests (real db)", () => {
  it("POST creates a refund for a paid payment", async () => {
    const app = createApp()
    const { cookie, userId } = await registerOwner(app)
    const payment = await seedPaidPayment(userId)

    const res = await request(app)
      .post("/business/refund-requests")
      .set("Cookie", cookie)
      .send({
        paymentRequestId: payment.id,
        destinationAddress: DESTINATION,
        reason: "customer asked",
      })
    expect(res.status).toBe(200)
    expect(typeof res.body.id).toBe("string")

    const [row] = await db
      .select()
      .from(refundRequests)
      .where(eq(refundRequests.id, res.body.id))
    expect(row.status).toBe("pending")
    expect(row.paymentRequestId).toBe(payment.id)
  })

  it("POST rejects when the payment is still pending", async () => {
    const app = createApp()
    const { cookie, userId } = await registerOwner(app)
    await db
      .insert(businessSettings)
      .values({ userId, name: "Acme" })
      .onConflictDoNothing()
    const now = new Date()
    const [pending] = await db
      .insert(paymentRequests)
      .values({
        merchantId: userId,
        chainId: 137,
        amountUsd: "10",
        amountToken: "10000000",
        tokenSymbol: "USDC",
        tokenAddress: USDC,
        tokenDecimals: 6,
        merchantWalletAddress: MERCHANT_WALLET,
        startBlock: "1",
        lastScannedBlock: "1",
        requiredConfirmations: 1,
        confirmations: 0,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + 3600_000),
        status: "pending",
      })
      .returning()
    const res = await request(app)
      .post("/business/refund-requests")
      .set("Cookie", cookie)
      .send({
        paymentRequestId: pending.id,
        destinationAddress: DESTINATION,
        reason: "x",
      })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("payment_not_paid")
  })

  it("POST rejects a duplicate pending refund for the same payment", async () => {
    const app = createApp()
    const { cookie, userId } = await registerOwner(app)
    const payment = await seedPaidPayment(userId)

    const first = await request(app)
      .post("/business/refund-requests")
      .set("Cookie", cookie)
      .send({
        paymentRequestId: payment.id,
        destinationAddress: DESTINATION,
        reason: "first",
      })
    expect(first.status).toBe(200)
    const second = await request(app)
      .post("/business/refund-requests")
      .set("Cookie", cookie)
      .send({
        paymentRequestId: payment.id,
        destinationAddress: DESTINATION,
        reason: "second",
      })
    expect(second.status).toBe(409)
    expect(second.body.error).toBe("conflict")
  })

  it("POST caps amountToken at receivedAmountToken", async () => {
    const app = createApp()
    const { cookie, userId } = await registerOwner(app)
    const payment = await seedPaidPayment(userId, "10000000")
    const res = await request(app)
      .post("/business/refund-requests")
      .set("Cookie", cookie)
      .send({
        paymentRequestId: payment.id,
        destinationAddress: DESTINATION,
        reason: "too much",
        amountToken: "20000000",
        amountUsd: "20",
      })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("refund amount exceeds collected amount")
  })

  it("POST requires a reason", async () => {
    const app = createApp()
    const { cookie, userId } = await registerOwner(app)
    const payment = await seedPaidPayment(userId)
    const res = await request(app)
      .post("/business/refund-requests")
      .set("Cookie", cookie)
      .send({
        paymentRequestId: payment.id,
        destinationAddress: DESTINATION,
        reason: "   ",
      })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("reason is required")
  })

  it("POST rejects an invalid destination address", async () => {
    const app = createApp()
    const { cookie, userId } = await registerOwner(app)
    const payment = await seedPaidPayment(userId)
    const res = await request(app)
      .post("/business/refund-requests")
      .set("Cookie", cookie)
      .send({
        paymentRequestId: payment.id,
        destinationAddress: "not-an-address",
        reason: "x",
      })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("invalid destination address")
  })

  it("GET filters by status=pending (default)", async () => {
    const app = createApp()
    const { cookie, userId } = await registerOwner(app)
    const payment = await seedPaidPayment(userId)
    await request(app)
      .post("/business/refund-requests")
      .set("Cookie", cookie)
      .send({
        paymentRequestId: payment.id,
        destinationAddress: DESTINATION,
        reason: "x",
      })
    const list = await request(app)
      .get("/business/refund-requests")
      .set("Cookie", cookie)
    expect(list.status).toBe(200)
    expect(list.body.refundRequests).toHaveLength(1)
    expect(list.body.refundRequests[0].status).toBe("pending")
  })

  it("GET scopes to the current business (cross-business isolation)", async () => {
    const app = createApp()
    const a = await registerOwner(app)
    const b = await registerOwner(app)
    const payment = await seedPaidPayment(a.userId)
    await request(app)
      .post("/business/refund-requests")
      .set("Cookie", a.cookie)
      .send({
        paymentRequestId: payment.id,
        destinationAddress: DESTINATION,
        reason: "a's refund",
      })
    const listB = await request(app)
      .get("/business/refund-requests")
      .set("Cookie", b.cookie)
    expect(listB.status).toBe(403)
  })

  it("PATCH approve creates a tx-intent and flips status", async () => {
    const app = createApp()
    const { cookie, userId } = await registerOwner(app)
    const payment = await seedPaidPayment(userId)
    const created = await request(app)
      .post("/business/refund-requests")
      .set("Cookie", cookie)
      .send({
        paymentRequestId: payment.id,
        destinationAddress: DESTINATION,
        reason: "x",
      })

    const res = await request(app)
      .patch(`/business/refund-requests/${created.body.id}`)
      .set("Cookie", cookie)
      .send({ action: "approve" })
    expect(res.status).toBe(200)
    expect(typeof res.body.txIntentId).toBe("string")

    const [intent] = await db
      .select()
      .from(txIntents)
      .where(eq(txIntents.id, res.body.txIntentId))
    expect(intent.userId).toBe(userId)
    expect(intent.status).toBe("pending")

    const [refund] = await db
      .select()
      .from(refundRequests)
      .where(eq(refundRequests.id, created.body.id))
    expect(refund.status).toBe("approved_pending_signature")
  })

  it("PATCH approve rejects a non-pending refund", async () => {
    const app = createApp()
    const { cookie, userId } = await registerOwner(app)
    const payment = await seedPaidPayment(userId)
    const created = await request(app)
      .post("/business/refund-requests")
      .set("Cookie", cookie)
      .send({
        paymentRequestId: payment.id,
        destinationAddress: DESTINATION,
        reason: "x",
      })
    await request(app)
      .patch(`/business/refund-requests/${created.body.id}`)
      .set("Cookie", cookie)
      .send({ action: "approve" })
    const again = await request(app)
      .patch(`/business/refund-requests/${created.body.id}`)
      .set("Cookie", cookie)
      .send({ action: "approve" })
    expect(again.status).toBe(400)
    expect(again.body.message).toBe("refund_not_pending")
  })

  it("PATCH reject flips status to rejected", async () => {
    const app = createApp()
    const { cookie, userId } = await registerOwner(app)
    const payment = await seedPaidPayment(userId)
    const created = await request(app)
      .post("/business/refund-requests")
      .set("Cookie", cookie)
      .send({
        paymentRequestId: payment.id,
        destinationAddress: DESTINATION,
        reason: "x",
      })
    const res = await request(app)
      .patch(`/business/refund-requests/${created.body.id}`)
      .set("Cookie", cookie)
      .send({ action: "reject" })
    expect(res.status).toBe(200)
    const [row] = await db
      .select()
      .from(refundRequests)
      .where(eq(refundRequests.id, created.body.id))
    expect(row.status).toBe("rejected")
  })

  it("PATCH mark_executed requires a hex txHash and verifies on-chain", async () => {
    const app = createApp()
    const { cookie, userId } = await registerOwner(app)
    const payment = await seedPaidPayment(userId)
    const created = await request(app)
      .post("/business/refund-requests")
      .set("Cookie", cookie)
      .send({
        paymentRequestId: payment.id,
        destinationAddress: DESTINATION,
        reason: "x",
      })
    await request(app)
      .patch(`/business/refund-requests/${created.body.id}`)
      .set("Cookie", cookie)
      .send({ action: "approve" })

    const noHash = await request(app)
      .patch(`/business/refund-requests/${created.body.id}`)
      .set("Cookie", cookie)
      .send({ action: "mark_executed" })
    expect(noHash.status).toBe(400)

    const badHash = await request(app)
      .patch(`/business/refund-requests/${created.body.id}`)
      .set("Cookie", cookie)
      .send({ action: "mark_executed", txHash: "not-hex" })
    expect(badHash.status).toBe(400)

    verifyMock.mockResolvedValueOnce({ status: "confirmed" })
    const ok = await request(app)
      .patch(`/business/refund-requests/${created.body.id}`)
      .set("Cookie", cookie)
      .send({
        action: "mark_executed",
        txHash:
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      })
    expect(ok.status).toBe(200)
    const [row] = await db
      .select()
      .from(refundRequests)
      .where(eq(refundRequests.id, created.body.id))
    expect(row.status).toBe("executed")
  })

  it("PATCH unknown action returns 400", async () => {
    const app = createApp()
    const { cookie, userId } = await registerOwner(app)
    const payment = await seedPaidPayment(userId)
    const created = await request(app)
      .post("/business/refund-requests")
      .set("Cookie", cookie)
      .send({
        paymentRequestId: payment.id,
        destinationAddress: DESTINATION,
        reason: "x",
      })
    const res = await request(app)
      .patch(`/business/refund-requests/${created.body.id}`)
      .set("Cookie", cookie)
      .send({ action: "do_something_else" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("invalid action")
  })

  it("PATCH on an unknown refund returns 404", async () => {
    const app = createApp()
    const { cookie, userId } = await registerOwner(app)
    // Seed business so the withBusinessAuth gate doesn't 403 first.
    await db
      .insert(businessSettings)
      .values({ userId, name: "Acme" })
      .onConflictDoNothing()
    const res = await request(app)
      .patch("/business/refund-requests/00000000-0000-0000-0000-000000000000")
      .set("Cookie", cookie)
      .send({ action: "approve" })
    expect(res.status).toBe(404)
  })
})
