import request from "supertest"
import { describe, expect, it } from "vitest"

import { eq } from "drizzle-orm"
import { db, addresses, businessSettings, mpcKeys, businessMembers } from "@walty/db"
import { createApp } from "../../src/app.js"

const MPC_ADDR = "0x1111111111111111111111111111111111111111"
const HD_ADDR = "0x2222222222222222222222222222222222222222"

async function registerOwner(app: ReturnType<typeof createApp>) {
  const email = `biz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
  const reg = await request(app)
    .post("/auth/register")
    .send({ email, password: "testpassword1234" })
  const cookie = (reg.headers["set-cookie"] as unknown as string[])[0]
  const sess = await request(app).get("/session").set("Cookie", cookie)
  return { cookie, userId: sess.body.user.id as number }
}

async function seedBusiness(userId: number) {
  await db
    .insert(businessSettings)
    .values({ userId, name: "Acme" })
    .onConflictDoNothing()
}

async function makeMpcOwner(userId: number) {
  await db.insert(mpcKeys).values({
    userId,
    pubkey: `0x${"ab".repeat(33)}`,
    address: MPC_ADDR,
    status: "active",
    version: 1,
  })
  await db.insert(addresses).values({ userId, address: MPC_ADDR })
}

function invite(
  app: ReturnType<typeof createApp>,
  cookie: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .post("/business/members/invite")
    .set("Cookie", cookie)
    .send(body)
}

/** Register a separate user and link them as an active keyless cashier of `businessId`. */
async function seedActiveCashier(
  app: ReturnType<typeof createApp>,
  businessId: number,
) {
  const c = await registerOwner(app)
  const [member] = await db
    .insert(businessMembers)
    .values({
      businessId,
      userId: c.userId,
      role: "cashier",
      status: "active",
      invitedBy: businessId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      derivationIndex: null,
      walletAddress: MPC_ADDR,
    })
    .returning()
  return { ...c, memberId: member.id }
}

describe("POST /business/members/invite — keyless cashiers under MPC (real db)", () => {
  it("MPC owner invites a keyless cashier (no walletAddress/derivationIndex)", async () => {
    const app = createApp()
    const { cookie, userId } = await registerOwner(app)
    await seedBusiness(userId)
    await makeMpcOwner(userId)

    const res = await invite(app, cookie, { role: "cashier" })

    expect(res.status).toBe(200)
    expect(res.body.walletAddress.toLowerCase()).toBe(MPC_ADDR.toLowerCase())
    expect(res.body.derivationIndex).toBeNull()
    expect(res.body.inviteToken).toBeTruthy()
  })

  it("MPC owner can invite a SECOND keyless cashier (null derivationIndex does not collide)", async () => {
    const app = createApp()
    const { cookie, userId } = await registerOwner(app)
    await seedBusiness(userId)
    await makeMpcOwner(userId)

    const first = await invite(app, cookie, { role: "cashier" })
    const second = await invite(app, cookie, { role: "cashier" })

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.body.walletAddress.toLowerCase()).toBe(MPC_ADDR.toLowerCase())
    expect(second.body.derivationIndex).toBeNull()
  })

  it("mnemonic owner still requires walletAddress + derivationIndex", async () => {
    const app = createApp()
    const { cookie, userId } = await registerOwner(app)
    await seedBusiness(userId) // no mpcKeys → legacy mnemonic business

    const missing = await invite(app, cookie, { role: "cashier" })
    expect(missing.status).toBe(400)

    const ok = await invite(app, cookie, {
      role: "cashier",
      walletAddress: HD_ADDR,
      derivationIndex: 1,
    })
    expect(ok.status).toBe(200)
    expect(ok.body.walletAddress.toLowerCase()).toBe(HD_ADDR.toLowerCase())
    expect(ok.body.derivationIndex).toBe(1)
  })
})

describe("MPC keyless cashier: payment requests + revocation (real db)", () => {
  it("a keyless cashier creates a payment request to the business MPC address", async () => {
    const app = createApp()
    const owner = await registerOwner(app)
    await seedBusiness(owner.userId)
    await makeMpcOwner(owner.userId)
    const cashier = await seedActiveCashier(app, owner.userId)

    const ok = await request(app)
      .post("/payment-requests")
      .set("Cookie", cashier.cookie)
      .send({ amountUsd: "5.00", token: "USDC", merchantWalletAddress: MPC_ADDR })
    expect(ok.status).toBe(200)
    expect(ok.body.merchantWalletAddress.toLowerCase()).toBe(MPC_ADDR.toLowerCase())

    const wrong = await request(app)
      .post("/payment-requests")
      .set("Cookie", cashier.cookie)
      .send({ amountUsd: "5.00", token: "USDC", merchantWalletAddress: HD_ADDR })
    expect(wrong.status).toBe(400)
  })

  it("the owner can revoke an MPC cashier despite the business address holding funds", async () => {
    const app = createApp()
    const owner = await registerOwner(app)
    await seedBusiness(owner.userId)
    await makeMpcOwner(owner.userId)
    const cashier = await seedActiveCashier(app, owner.userId)

    // The MPC branch skips operatorHasBalance entirely (no per-operator wallet),
    // so revoke is a pure status flip with no on-chain balance RPC.
    const res = await request(app)
      .patch(`/business/members/${cashier.memberId}`)
      .set("Cookie", owner.cookie)
      .send({ action: "revoke" })
    expect(res.status).toBe(200)

    const row = await db.query.businessMembers.findFirst({
      where: eq(businessMembers.id, cashier.memberId),
      columns: { status: true },
    })
    expect(row!.status).toBe("revoked")
  })
})
