import { test, expect } from "@playwright/test"
import { uniqueEmail } from "./helpers/email"
import { registerOwner } from "./helpers/api"
import { completeMpcOnboarding, unlock } from "./helpers/flows"

// Tier 1 — relock: the wallet must relock when the in-memory key is cleared.
// These complement unlock.spec.ts (which covers the lock after onboarding) by
// verifying that the lock is not bypassed after a real unlock cycle.
// Serial: each runs a real DKG.
test.describe("relock @tier1", () => {
  test.describe.configure({ mode: "serial" })

  test("unlocked wallet relocks on page reload @tier1", async ({ page }) => {
    await page.goto("/")
    await registerOwner(page, uniqueEmail())
    await completeMpcOnboarding(page, { pin: "123456" })

    // After onboarding the wallet is unlocked — lock screen is not shown.
    await expect(page.locator("#unlock-pin")).not.toBeVisible()

    // Reload clears the in-memory key; the lock screen must reappear.
    await page.reload()
    await expect(page.locator("#unlock-pin")).toBeVisible({ timeout: 20_000 })

    // Verify the PIN still works after relock.
    await unlock(page, "123456")
    await expect(page.locator("#unlock-pin")).not.toBeVisible({ timeout: 20_000 })
  })

  test("wallet relocks again after unlock + second reload @tier1", async ({ page }) => {
    await page.goto("/")
    await registerOwner(page, uniqueEmail())
    await completeMpcOnboarding(page, { pin: "123456" })

    // First reload → locks.
    await page.reload()
    await expect(page.locator("#unlock-pin")).toBeVisible({ timeout: 20_000 })

    // Unlock the wallet with the correct PIN.
    await unlock(page, "123456")
    await expect(page.locator("#unlock-pin")).not.toBeVisible({ timeout: 20_000 })

    // Second reload — the unlocked key is NOT persisted to storage (by design:
    // only the encrypted form lives in IndexedDB). Must relock.
    await page.reload()
    await expect(page.locator("#unlock-pin")).toBeVisible({ timeout: 20_000 })
  })

  test("navigating away from /dashboard and back relocks the wallet @tier1", async ({ page }) => {
    await page.goto("/")
    await registerOwner(page, uniqueEmail())
    await completeMpcOnboarding(page, { pin: "123456" })

    // After onboarding the wallet is unlocked.
    await expect(page.locator("#unlock-pin")).not.toBeVisible()

    // Navigate away from the dashboard — this unmounts the dashboard layout and
    // clears the in-memory wallet state.
    await page.goto("/onboarding")
    // Navigate back to the dashboard — should require re-unlock.
    await page.goto("/dashboard/home")
    await expect(page.locator("#unlock-pin")).toBeVisible({ timeout: 20_000 })
  })
})
