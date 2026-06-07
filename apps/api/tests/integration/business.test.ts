import request from "supertest"
import { describe, expect, it } from "vitest"
import { and, eq } from "drizzle-orm"

import { db, addresses, businessSettings, mpcKeys, mpcChildAddresses } from "@walty/db"
import { createApp } from "../../src/app.js"

const MPC_ADDR = "0x1111111111111111111111111111111111111111"
const CHILD_ADDR = "0x2222222222222222222222222222222222222222"

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
  await db.insert(businessSettings).values({ userId, name: "Acme" }).onConflictDoNothing()
}

async function makeMpcOwner(userId: number): Promise<string> {
  const [key] = await db
    .insert(mpcKeys)
    .values({ userId, pubkey: `0x${"ab".repeat(33)}`, address: MPC_ADDR, status: "active", version: 1 })
    .returning()
  await db.insert(addresses).values({ userId, address: MPC_ADDR })
  return key.id
}

function invite(app: ReturnType<typeof createApp>, cookie: string, body: Record<string, unknown>) {
  return request(app).post("/business/members/invite").set("Cookie", cookie).send(body)
}

describe("POST /business/members/invite — MPC HD child-address registration (real db)", () => {
  it("registers the cashier's HD child address in mpc_child_addresses", async () => {
    const app = createApp()
    const { cookie, userId } = await registerOwner(app)
    await seedBusiness(userId)
    const keyId = await makeMpcOwner(userId)

    const res = await invite(app, cookie, {
      role: "cashier",
      walletAddress: CHILD_ADDR,
      derivationIndex: 1,
    })
    expect(res.status).toBe(200)
    expect(res.body.walletAddress.toLowerCase()).toBe(CHILD_ADDR.toLowerCase())
    expect(res.body.derivationIndex).toBe(1)

    const child = await db.query.mpcChildAddresses.findFirst({
      where: and(eq(mpcChildAddresses.keyId, keyId), eq(mpcChildAddresses.derivationIndex, 1)),
    })
    expect(child).toBeTruthy()
    expect(child!.address.toLowerCase()).toBe(CHILD_ADDR.toLowerCase())
  })

  it("a mnemonic owner invite registers no child address", async () => {
    const app = createApp()
    const { cookie, userId } = await registerOwner(app)
    await seedBusiness(userId) // no mpcKeys → legacy mnemonic business

    const res = await invite(app, cookie, {
      role: "cashier",
      walletAddress: CHILD_ADDR,
      derivationIndex: 1,
    })
    expect(res.status).toBe(200)

    const rows = await db.select().from(mpcChildAddresses)
    expect(rows.length).toBe(0)
  })
})
