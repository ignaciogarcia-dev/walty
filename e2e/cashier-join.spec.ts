import { test, expect } from "@playwright/test"
import { randomUUID } from "node:crypto"
import { uniqueEmail, E2E_PASSWORD } from "./helpers/email"
import { registerOwner, registerUser, apiRegister, apiSession } from "./helpers/api"
import { seedMember } from "./helpers/db"

// Tier 2 — cashier invite/join. The GET /api/join/:token states are asserted via
// the API (locale-independent); the accept + register-with-invite paths via the
// real flow. A single page registers the owner (the business) then the joiner.
test.describe("cashier join @tier2", () => {
  test("GET invite states: valid / expired / revoked / not-found", async ({ page }) => {
    await page.goto("/")
    const { userId: businessId } = await registerOwner(page, uniqueEmail("owner"))

    const valid = randomUUID()
    const expired = randomUUID()
    const revoked = randomUUID()
    await seedMember({ businessId, invitedBy: businessId, token: valid })
    await seedMember({ businessId, invitedBy: businessId, token: expired, expiresInDays: -1 })
    await seedMember({ businessId, invitedBy: businessId, token: revoked, status: "revoked" })

    expect((await (await page.request.get(`/api/join/${valid}`)).json()).status).toBe("valid")
    expect((await (await page.request.get(`/api/join/${expired}`)).json()).status).toBe("expired")
    expect((await (await page.request.get(`/api/join/${revoked}`)).json()).status).toBe("revoked")
    expect((await page.request.get(`/api/join/${randomUUID()}`)).status()).toBe(404)
  })

  test("GET already-accepted invite", async ({ page }) => {
    await page.goto("/")
    const { userId: businessId } = await registerOwner(page, uniqueEmail("owner"))
    const { userId: acceptorId } = await registerUser(page, uniqueEmail("acc"))
    const token = randomUUID()
    await seedMember({ businessId, invitedBy: businessId, token, userId: acceptorId, status: "active" })

    const body = await (await page.request.get(`/api/join/${token}`)).json()
    expect(body.status).toBe("already_accepted")
  })

  test("logged-in user accepts a valid invite → becomes an active member", async ({ page }) => {
    await page.goto("/")
    const { userId: businessId } = await registerOwner(page, uniqueEmail("owner"))
    const token = randomUUID()
    await seedMember({ businessId, invitedBy: businessId, token })

    // The later register cookie (the joiner) wins; accept as that user.
    await registerUser(page, uniqueEmail("join"))
    const accept = await page.request.post(`/api/join/${token}`)
    expect(accept.status()).toBe(200)
    expect((await accept.json()).ok).toBe(true)

    const sess = await (await apiSession(page)).json()
    expect(sess.user.isOwner).toBe(false)
    expect(sess.user.hasActiveBusiness).toBe(true)
  })

  test("register-with-invite (UI) lands on the business dashboard", async ({ page }) => {
    await page.goto("/")
    const { userId: businessId } = await registerOwner(page, uniqueEmail("owner"))
    const token = randomUUID()
    await seedMember({ businessId, invitedBy: businessId, token })

    // The owner cookie is still set from registerOwner; log out so the guard shows
    // the register form (an authed user is redirected away from /onboarding/register).
    const logoutRes = await page.request.post("/api/auth/logout")
    expect(logoutRes.ok()).toBeTruthy()
    await page.goto(`/onboarding/register?invite=${token}`)
    await page.locator("#email").fill(uniqueEmail("join"))
    await page.locator("#password").fill(E2E_PASSWORD)
    await page.getByRole("button", { name: "Register" }).click()
    await page.waitForURL(/\/dashboard\/business\/home/, { timeout: 20_000 })
  })

  test("register-with-invite (API) joins the business", async ({ page }) => {
    await page.goto("/")
    const { userId: businessId } = await registerOwner(page, uniqueEmail("owner"))
    const token = randomUUID()
    await seedMember({ businessId, invitedBy: businessId, token })

    const reg = await apiRegister(page, uniqueEmail("join"), { inviteToken: token })
    expect(reg.status()).toBe(200)
    expect((await reg.json()).hasActiveBusiness).toBe(true)
    const sess = await (await apiSession(page)).json()
    expect(sess.user.isOwner).toBe(false)
  })

  // The REAL invite-creation path (POST /business/members/invite) — exercises the
  // per-cashier HD child address + derivationIndex that seedMember shortcuts past.
  // Two valid (lowercase, checksum-free) EVM addresses.
  const ADDR_A = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8"
  const ADDR_B = "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc"
  const invite = (page: import("@playwright/test").Page, data: Record<string, unknown>) =>
    page.request.post("/api/business/members/invite", { data: { role: "cashier", ...data } })

  test("owner creates a real cashier invite with an HD child address", async ({ page }) => {
    await page.goto("/")
    await registerOwner(page, uniqueEmail("owner"))
    const { nextIndex } = await (await page.request.get("/api/business/members/next-index")).json()
    expect(nextIndex).toBe(1)

    const res = await invite(page, { walletAddress: ADDR_A, derivationIndex: nextIndex })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.inviteToken).toBeTruthy()
    expect(body.walletAddress).toBe(ADDR_A)
    expect(body.derivationIndex).toBe(1)

    const join = await (await page.request.get(`/api/join/${body.inviteToken}`)).json()
    expect(join.status).toBe("valid")
  })

  test("invite rejects an invalid address, a bad index, and a duplicate index", async ({ page }) => {
    await page.goto("/")
    await registerOwner(page, uniqueEmail("owner"))
    expect((await invite(page, { walletAddress: "not-an-address", derivationIndex: 1 })).status()).toBe(400)
    expect((await invite(page, { walletAddress: ADDR_A, derivationIndex: 0 })).status()).toBe(400)
    expect((await invite(page, { walletAddress: ADDR_A, derivationIndex: 1 })).status()).toBe(200)
    // index 1 now taken → a second invite at the same index is rejected
    expect((await invite(page, { walletAddress: ADDR_B, derivationIndex: 1 })).status()).toBe(400)
  })

  test("register-with-invite rejects an email mismatch", async ({ page }) => {
    await page.goto("/")
    await registerOwner(page, uniqueEmail("owner"))
    const res = await invite(page, {
      walletAddress: ADDR_A,
      derivationIndex: 1,
      inviteEmail: "specific@example.com",
    })
    const { inviteToken } = await res.json()

    const reg = await apiRegister(page, uniqueEmail("different"), { inviteToken })
    expect(reg.status()).toBe(400)
    expect((await reg.json()).message).toBe("invite-email-mismatch")
  })
})
