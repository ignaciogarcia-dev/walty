import { test, expect } from "@playwright/test"
import { uniqueEmail } from "./helpers/email"
import { registerOwner } from "./helpers/api"
import { completeMpcOnboarding, unlock } from "./helpers/flows"

// Tier 1 — the returning-user unlock flow: after onboarding, a reload locks the
// wallet (the device share lives in IndexedDB, not in memory) and the LockScreen
// must accept the PIN. Serial: each runs a real DKG.
test.describe.configure({ mode: "serial" })

test("reload after onboarding locks the wallet; the correct PIN unlocks it @tier1", async ({ page }) => {
  await page.goto("/")
  await registerOwner(page, uniqueEmail())
  await completeMpcOnboarding(page, { pin: "123456" })

  await page.reload()
  await expect(page.locator("#unlock-pin")).toBeVisible({ timeout: 20_000 })
  await unlock(page, "123456")
  await expect(page.locator("#unlock-pin")).toBeHidden({ timeout: 20_000 })
  await expect(page).toHaveURL(/\/dashboard/)
})

test("a wrong PIN shows an unlock error @tier1", async ({ page }) => {
  await page.goto("/")
  await registerOwner(page, uniqueEmail())
  await completeMpcOnboarding(page)

  await page.reload()
  await expect(page.locator("#unlock-pin")).toBeVisible({ timeout: 20_000 })
  await unlock(page, "999999")
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 20_000 })
  await expect(page.locator("#unlock-pin")).toBeVisible({ timeout: 20_000 })
})
