import { test, expect } from "@playwright/test"
import { uniqueEmail } from "./helpers/email"
import { registerOwner, apiSession } from "./helpers/api"

// Harness smoke: validates the full stack wiring (web build + /api rewrite +
// real API + cookie auth) before the heavier flow specs. @tier2
test("register owner via API → session reflects owner + business @tier2", async ({ page }) => {
  await page.goto("/") // bind page.request cookies to baseURL
  const { userId } = await registerOwner(page, uniqueEmail())
  expect(userId).toBeGreaterThan(0)

  const sess = await (await apiSession(page)).json()
  expect(sess.user.isOwner).toBe(true)
  expect(sess.user.hasBusinessSettings).toBe(true)
})
