import { test, expect } from "@playwright/test"
import { randomUUID } from "node:crypto"
import { uniqueEmail } from "./helpers/email"
import { registerOwner, registerUser, apiSession } from "./helpers/api"
import { seedMember, type MemberStatus } from "./helpers/db"

// Tier 2 — dashboard gating: operator confinement + business-status redirects.
// One page does double duty: register the owner (to exist as the business), then
// register the operator (the later register cookie wins), then seed the membership.
async function makeOperator(page: import("@playwright/test").Page, status: MemberStatus) {
  await page.goto("/")
  const { userId: businessId } = await registerOwner(page, uniqueEmail("owner"))
  const { userId: operatorId } = await registerUser(page, uniqueEmail("op"))
  await seedMember({
    businessId,
    invitedBy: businessId,
    userId: operatorId,
    token: randomUUID(),
    status,
  })
  // Guard: verify the auth cookie is for the operator, not the owner.
  const sessRes = await apiSession(page)
  if (!sessRes.ok()) throw new Error(`session check failed after makeOperator: ${sessRes.status()}`)
  const sess = await sessRes.json()
  if (sess.user.id !== operatorId) throw new Error(`expected operator session (${operatorId}) but got ${sess.user.id}`)
  return { businessId, operatorId }
}

test.describe("dashboard gating @tier2", () => {
  test("active operator is confined to /dashboard/business/*", async ({ page }) => {
    await makeOperator(page, "active")
    const sess = await (await apiSession(page)).json()
    expect(sess.user.isOwner).toBe(false)
    expect(sess.user.hasActiveBusiness).toBe(true)

    await page.goto("/dashboard/home")
    await page.waitForURL(/\/dashboard\/business\/home/, { timeout: 20_000 })
  })

  test("suspended operator → access-suspended", async ({ page }) => {
    await makeOperator(page, "suspended")
    await page.goto("/dashboard/home")
    await page.waitForURL(/\/dashboard\/access-suspended/, { timeout: 20_000 })
  })

  test("revoked operator → access-revoked", async ({ page }) => {
    await makeOperator(page, "revoked")
    await page.goto("/dashboard/home")
    await page.waitForURL(/\/dashboard\/access-revoked/, { timeout: 20_000 })
  })

  test("owner with incomplete onboarding → back into onboarding", async ({ page }) => {
    await page.goto("/")
    await registerUser(page, uniqueEmail()) // owner, no business yet
    await page.goto("/dashboard/home")
    await page.waitForURL(/\/onboarding\/setup-business/, { timeout: 20_000 })
  })
})
