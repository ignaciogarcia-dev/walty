import { test, expect } from "@playwright/test"
import { uniqueEmail } from "./helpers/email"
import { registerUser, registerOwner } from "./helpers/api"

// Tier 2 — the onboarding guard (apps/web/app/onboarding/_components/guard.tsx) +
// the per-page reload guards. All assertions are on client-side redirects, so no
// product testids are needed. Each test uses a fresh context (no auth by default).
test.describe("onboarding guard @tier2", () => {
  test("unauthenticated + no wallet → inner step redirects to welcome", async ({ page }) => {
    await page.goto("/onboarding/create-wallet")
    await page.waitForURL(/\/onboarding\/welcome/, { timeout: 20_000 })
  })

  test("unauthenticated may sit on login and register", async ({ page }) => {
    await page.goto("/onboarding/login")
    await expect(page).toHaveURL(/\/onboarding\/login/)
    await page.goto("/onboarding/register")
    await expect(page).toHaveURL(/\/onboarding\/register/)
  })

  test("authenticated owner without a business → setup-business", async ({ page }) => {
    await page.goto("/")
    await registerUser(page, uniqueEmail())
    await page.goto("/onboarding/welcome")
    await page.waitForURL(/\/onboarding\/setup-business/, { timeout: 20_000 })
  })

  test("authenticated owner with a business but no wallet → create-wallet", async ({ page }) => {
    await page.goto("/")
    await registerOwner(page, uniqueEmail())
    await page.goto("/onboarding/welcome")
    await page.waitForURL(/\/onboarding\/create-wallet\?reason=reloaded/, { timeout: 20_000 })
  })

  // The per-page reload guards: landing on a mid-flow step with no in-memory
  // onboarding context (a reload / deep link) bounces back to create-wallet.
  test("recovery-kit with no in-memory context → create-wallet?reason=reloaded", async ({ page }) => {
    await page.goto("/")
    await registerOwner(page, uniqueEmail())
    await page.goto("/onboarding/recovery-kit")
    await page.waitForURL(/\/onboarding\/create-wallet\?reason=reloaded/, { timeout: 20_000 })
  })

  test("create-pin with no in-memory context → create-wallet?reason=reloaded", async ({ page }) => {
    await page.goto("/")
    await registerOwner(page, uniqueEmail())
    await page.goto("/onboarding/create-pin")
    await page.waitForURL(/\/onboarding\/create-wallet\?reason=reloaded/, { timeout: 20_000 })
  })
})
