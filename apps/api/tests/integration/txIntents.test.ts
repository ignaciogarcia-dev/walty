import request from "supertest"
import { encodeFunctionData, erc20Abi, parseUnits } from "viem"
import {
  generatePrivateKey,
  privateKeyToAccount,
  signTransaction,
} from "viem/accounts"
import { describe, expect, it } from "vitest"
import { createApp } from "../../src/app.js"

// Polygon native USDC contract (matches the token registry).
const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"

async function authedCookie(app: ReturnType<typeof createApp>) {
  const email = `int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
  const reg = await request(app)
    .post("/auth/register")
    .send({ email, password: "testpassword1234" })
  return (reg.headers["set-cookie"] as unknown as string[])[0]
}

async function buildErc20Tx(opts: {
  pk: `0x${string}`
  recipient: `0x${string}`
  amount: bigint
  token?: `0x${string}`
}) {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [opts.recipient, opts.amount],
  })
  return signTransaction({
    privateKey: opts.pk,
    transaction: {
      type: "eip1559",
      chainId: 137,
      to: opts.token ?? USDC,
      data,
      value: 0n,
      gas: 100_000n,
      maxFeePerGas: 1_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      nonce: 0,
    },
  })
}

function makeEoa() {
  const pk = generatePrivateKey()
  return { pk, account: privateKeyToAccount(pk) }
}

describe("tx-intents (real db)", () => {
  it("idempotency: same key + same payload returns the original intent", async () => {
    const app = createApp()
    const cookie = await authedCookie(app)
    const recipient = makeEoa().account.address
    const sender = makeEoa().account.address
    const payload = {
      to: recipient,
      amount: "1.5",
      chainId: 137,
      token: { symbol: "USDC", address: USDC, type: "erc20", decimals: 6 },
      from: sender,
    }

    const first = await request(app)
      .post("/tx-intents")
      .set("Cookie", cookie)
      .send({ type: "transfer", payload, idempotencyKey: "key-1" })
    expect(first.status).toBe(200)

    const second = await request(app)
      .post("/tx-intents")
      .set("Cookie", cookie)
      .send({ type: "transfer", payload, idempotencyKey: "key-1" })
    expect(second.status).toBe(200)
    expect(second.body.id).toBe(first.body.id)
  })

  it("idempotency: same key + different payload is a 409 (no silent swap)", async () => {
    const app = createApp()
    const cookie = await authedCookie(app)
    const sender = makeEoa().account.address

    const first = await request(app)
      .post("/tx-intents")
      .set("Cookie", cookie)
      .send({
        type: "transfer",
        idempotencyKey: "key-2",
        payload: {
          to: makeEoa().account.address,
          amount: "1.5",
          chainId: 137,
          token: { symbol: "USDC", address: USDC, type: "erc20", decimals: 6 },
          from: sender,
        },
      })
    expect(first.status).toBe(200)

    const second = await request(app)
      .post("/tx-intents")
      .set("Cookie", cookie)
      .send({
        type: "transfer",
        idempotencyKey: "key-2",
        payload: {
          to: makeEoa().account.address, // different recipient
          amount: "1.5",
          chainId: 137,
          token: { symbol: "USDC", address: USDC, type: "erc20", decimals: 6 },
          from: sender,
        },
      })
    expect(second.status).toBe(409)
    expect(second.body.error).toBe("conflict")
  })

  it("sign rejects raw bytes with swapped recipient (substitution attack)", async () => {
    const app = createApp()
    const cookie = await authedCookie(app)
    const { pk, account } = makeEoa()
    const authorized = makeEoa().account.address
    const attacker = makeEoa().account.address

    const create = await request(app)
      .post("/tx-intents")
      .set("Cookie", cookie)
      .send({
        type: "transfer",
        payload: {
          to: authorized,
          amount: "1",
          chainId: 137,
          token: { symbol: "USDC", address: USDC, type: "erc20", decimals: 6 },
          from: account.address,
        },
      })
    expect(create.status).toBe(200)

    const malicious = await buildErc20Tx({
      pk,
      recipient: attacker,
      amount: parseUnits("1", 6),
    })

    const sign = await request(app)
      .post(`/tx-intents/${create.body.id}/sign`)
      .set("Cookie", cookie)
      .send({ signedRaw: malicious })
    expect(sign.status).toBe(400)
    expect(sign.body.message).toMatch(/SIGNED_TX_TO_MISMATCH/)
  })

  it("sign accepts honest bytes and transitions to signed", async () => {
    const app = createApp()
    const cookie = await authedCookie(app)
    const { pk, account } = makeEoa()
    const recipient = makeEoa().account.address

    const create = await request(app)
      .post("/tx-intents")
      .set("Cookie", cookie)
      .send({
        type: "transfer",
        payload: {
          to: recipient,
          amount: "1",
          chainId: 137,
          token: { symbol: "USDC", address: USDC, type: "erc20", decimals: 6 },
          from: account.address,
        },
      })
    expect(create.status).toBe(200)

    const honest = await buildErc20Tx({
      pk,
      recipient,
      amount: parseUnits("1", 6),
    })
    const sign = await request(app)
      .post(`/tx-intents/${create.body.id}/sign`)
      .set("Cookie", cookie)
      .send({ signedRaw: honest })
    expect(sign.status).toBe(200)
    expect(sign.body.status).toBe("signed")
    expect(sign.body.signedRaw).toBe(honest)
  })

  it("broadcast CAS: a second broadcast on the same signed intent is a 409", async () => {
    const app = createApp()
    const cookie = await authedCookie(app)
    const { pk, account } = makeEoa()
    const recipient = makeEoa().account.address

    const create = await request(app)
      .post("/tx-intents")
      .set("Cookie", cookie)
      .send({
        type: "transfer",
        payload: {
          to: recipient,
          amount: "1",
          chainId: 137,
          token: { symbol: "USDC", address: USDC, type: "erc20", decimals: 6 },
          from: account.address,
        },
      })

    const honest = await buildErc20Tx({
      pk,
      recipient,
      amount: parseUnits("1", 6),
    })
    await request(app)
      .post(`/tx-intents/${create.body.id}/sign`)
      .set("Cookie", cookie)
      .send({ signedRaw: honest })

    // Race two broadcasts. The CAS guarantee is "at most one winner":
    // exactly one request transitions the intent signed→broadcasting and
    // proceeds to RPC, the other sees the new status and returns 409.
    // The winner then hits Polygon RPC; the EOA has no balance, so the
    // RPC rejects, the route reverts to pending and the response is 500.
    // The invariant we assert is "at least one 409" — that proves the
    // CAS rejected the loser. Two 500s (a bug where both win CAS and
    // both go to RPC) or two 200s would NOT satisfy this.
    const [a, b] = await Promise.all([
      request(app)
        .post(`/tx-intents/${create.body.id}/broadcast`)
        .set("Cookie", cookie),
      request(app)
        .post(`/tx-intents/${create.body.id}/broadcast`)
        .set("Cookie", cookie),
    ])
    const statuses = [a.status, b.status]
    expect(statuses).toContain(409)
    // And the loser's error body is the ConflictError, not a generic 5xx.
    const loser = a.status === 409 ? a : b
    expect(loser.body.error).toBe("conflict")
  })

  it("GET /tx-intents lists only own intents", async () => {
    const app = createApp()
    const cookieA = await authedCookie(app)
    const cookieB = await authedCookie(app)

    const sender = makeEoa().account.address
    const payload = {
      to: makeEoa().account.address,
      amount: "1",
      chainId: 137,
      token: { symbol: "USDC", address: USDC, type: "erc20", decimals: 6 },
      from: sender,
    }
    await request(app)
      .post("/tx-intents")
      .set("Cookie", cookieA)
      .send({ type: "transfer", payload })

    const listA = await request(app).get("/tx-intents").set("Cookie", cookieA)
    const listB = await request(app).get("/tx-intents").set("Cookie", cookieB)
    expect(listA.body).toHaveLength(1)
    expect(listB.body).toHaveLength(0)
  })

  it("GET /tx-intents/:id returns 404 for a foreign user", async () => {
    const app = createApp()
    const cookieA = await authedCookie(app)
    const cookieB = await authedCookie(app)
    const created = await request(app)
      .post("/tx-intents")
      .set("Cookie", cookieA)
      .send({
        type: "transfer",
        payload: {
          to: makeEoa().account.address,
          amount: "1",
          chainId: 137,
          token: { symbol: "USDC", address: USDC, type: "erc20", decimals: 6 },
          from: makeEoa().account.address,
        },
      })
    const res = await request(app)
      .get(`/tx-intents/${created.body.id}`)
      .set("Cookie", cookieB)
    expect(res.status).toBe(404)
  })

  it("POST /sign rejects when intent is not pending", async () => {
    const app = createApp()
    const cookie = await authedCookie(app)
    const { pk, account } = makeEoa()
    const recipient = makeEoa().account.address
    const create = await request(app)
      .post("/tx-intents")
      .set("Cookie", cookie)
      .send({
        type: "transfer",
        payload: {
          to: recipient,
          amount: "1",
          chainId: 137,
          token: { symbol: "USDC", address: USDC, type: "erc20", decimals: 6 },
          from: account.address,
        },
      })
    const raw = await buildErc20Tx({
      pk,
      recipient,
      amount: parseUnits("1", 6),
    })
    const first = await request(app)
      .post(`/tx-intents/${create.body.id}/sign`)
      .set("Cookie", cookie)
      .send({ signedRaw: raw })
    expect(first.status).toBe(200)

    const second = await request(app)
      .post(`/tx-intents/${create.body.id}/sign`)
      .set("Cookie", cookie)
      .send({ signedRaw: raw })
    expect(second.status).toBe(400)
    expect(second.body.message).toMatch(/Cannot sign intent in status "signed"/)
  })

  it("POST /broadcast rejects when intent is still pending (not signed)", async () => {
    const app = createApp()
    const cookie = await authedCookie(app)
    const create = await request(app)
      .post("/tx-intents")
      .set("Cookie", cookie)
      .send({
        type: "transfer",
        payload: {
          to: makeEoa().account.address,
          amount: "1",
          chainId: 137,
          token: { symbol: "USDC", address: USDC, type: "erc20", decimals: 6 },
          from: makeEoa().account.address,
        },
      })
    const res = await request(app)
      .post(`/tx-intents/${create.body.id}/broadcast`)
      .set("Cookie", cookie)
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/status "pending"/)
  })

  it("POST /retry only works from failed", async () => {
    const app = createApp()
    const cookie = await authedCookie(app)
    const create = await request(app)
      .post("/tx-intents")
      .set("Cookie", cookie)
      .send({
        type: "transfer",
        payload: {
          to: makeEoa().account.address,
          amount: "1",
          chainId: 137,
          token: { symbol: "USDC", address: USDC, type: "erc20", decimals: 6 },
          from: makeEoa().account.address,
        },
      })
    const res = await request(app)
      .post(`/tx-intents/${create.body.id}/retry`)
      .set("Cookie", cookie)
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/status "pending"/)
  })

  it("PATCH /tx-intents/:id rejects invalid status values", async () => {
    const app = createApp()
    const cookie = await authedCookie(app)
    const create = await request(app)
      .post("/tx-intents")
      .set("Cookie", cookie)
      .send({
        type: "transfer",
        payload: {
          to: makeEoa().account.address,
          amount: "1",
          chainId: 137,
          token: { symbol: "USDC", address: USDC, type: "erc20", decimals: 6 },
          from: makeEoa().account.address,
        },
      })
    const res = await request(app)
      .patch(`/tx-intents/${create.body.id}`)
      .set("Cookie", cookie)
      .send({ status: "something_weird" })
    expect(res.status).toBe(400)
  })

  it("PATCH /tx-intents/:id only flips broadcasted → confirmed", async () => {
    const app = createApp()
    const cookie = await authedCookie(app)
    const create = await request(app)
      .post("/tx-intents")
      .set("Cookie", cookie)
      .send({
        type: "transfer",
        payload: {
          to: makeEoa().account.address,
          amount: "1",
          chainId: 137,
          token: { symbol: "USDC", address: USDC, type: "erc20", decimals: 6 },
          from: makeEoa().account.address,
        },
      })
    // Request is still "pending" — PATCH should be a no-op, returning current.
    const res = await request(app)
      .patch(`/tx-intents/${create.body.id}`)
      .set("Cookie", cookie)
      .send({ status: "confirmed" })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe("pending")
  })

  it("POST /sign rejects bytes that don't decode (malformed hex)", async () => {
    const app = createApp()
    const cookie = await authedCookie(app)
    const create = await request(app)
      .post("/tx-intents")
      .set("Cookie", cookie)
      .send({
        type: "transfer",
        payload: {
          to: makeEoa().account.address,
          amount: "1",
          chainId: 137,
          token: { symbol: "USDC", address: USDC, type: "erc20", decimals: 6 },
          from: makeEoa().account.address,
        },
      })
    const bad = await request(app)
      .post(`/tx-intents/${create.body.id}/sign`)
      .set("Cookie", cookie)
      .send({ signedRaw: "0xnothex" })
    expect(bad.status).toBe(400)
    expect(bad.body.message).toMatch(/Invalid signed transaction/)
  })

  it("GET /tx-intents respects ?limit", async () => {
    const app = createApp()
    const cookie = await authedCookie(app)
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/tx-intents")
        .set("Cookie", cookie)
        .send({
          type: "transfer",
          payload: {
            to: makeEoa().account.address,
            amount: `${i + 1}`,
            chainId: 137,
            token: { symbol: "USDC", address: USDC, type: "erc20", decimals: 6 },
            from: makeEoa().account.address,
          },
        })
    }
    const res = await request(app)
      .get("/tx-intents?limit=2")
      .set("Cookie", cookie)
    expect(res.body).toHaveLength(2)
  })
})
