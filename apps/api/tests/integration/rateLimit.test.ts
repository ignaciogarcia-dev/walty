import request from "supertest"
import { beforeEach, describe, expect, it } from "vitest"
import { createApp } from "../../src/app.js"

// Exercises the real Postgres-backed limiter (no mock) to prove that each
// endpoint gets its own per-user bucket, so exhausting one does not throttle
// another. Regression guard for the old `user:<id>` shared-counter behaviour.

type App = ReturnType<typeof createApp>

const PASSWORD = "testpassword1234"

async function registerUser(app: App): Promise<string> {
  const reg = await request(app)
    .post("/auth/register")
    .send({ email: `rl-${Date.now()}-${Math.random()}@example.com`, password: PASSWORD })
  expect(reg.status).toBe(200)
  return (reg.headers["set-cookie"] as unknown as string[])[0]
}

describe("rate limiting is bucketed per endpoint", () => {
  let app: App

  beforeEach(() => {
    app = createApp()
  })

  it("exhausting one endpoint does not throttle a different endpoint", async () => {
    const cookie = await registerUser(app)

    // POST /wallet/nonce is limited to 5/min — the 6th call trips it.
    let lastStatus = 0
    for (let i = 0; i < 6; i++) {
      lastStatus = (await request(app).post("/wallet/nonce").set("Cookie", cookie))
        .status
    }
    expect(lastStatus).toBe(429)

    // GET /wallet/backup has its own bucket: it isn't throttled by the nonce
    // bucket and reaches its handler, returning the normal gated 403 (this
    // fresh device holds no wallet key and has no approved pairing). Under the
    // old shared counter this would have returned 429 instead.
    const backup = await request(app).get("/wallet/backup").set("Cookie", cookie)
    expect(backup.status).not.toBe(429)
    expect(backup.status).toBe(403)
  })
})
