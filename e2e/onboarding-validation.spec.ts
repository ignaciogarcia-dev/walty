import { test, expect } from "@playwright/test"
import { uniqueEmail } from "./helpers/email"
import { registerOwner } from "./helpers/api"
import { runDkg, completeRecoveryKit } from "./helpers/flows"

// Tier 1 — onboarding form-level validation (the negative UI paths). These need a
// real DKG to render the recovery-kit/create-pin forms. Serial: each runs a DKG.
test.describe.configure({ mode: "serial" })

test("recovery-kit: weak password disables download; a mismatch errors @tier1", async ({ page }) => {
  await page.goto("/")
  await registerOwner(page, uniqueEmail())
  await runDkg(page) // lands on recovery-kit

  const password = page.locator("#recovery-password")
  const confirm = page.locator("#recovery-password-confirm")
  const download = page.getByRole("button", { name: "Download recovery kit" })

  await password.fill("short") // < 12 chars
  await expect(download).toBeDisabled()

  await password.fill("a-strong-recovery-pass")
  await confirm.fill("a-different-passphrase")
  // The download button stays enabled with a mismatch — validation fires on submit,
  // not live. If this changes (live validation added), this assertion will need updating.
  await expect(download).toBeEnabled()
  await download.click()
  await expect(page.getByRole("alert")).toBeVisible()
})

test("create-pin: short PIN disables submit; a mismatch errors @tier1", async ({ page }) => {
  await page.goto("/")
  await registerOwner(page, uniqueEmail())
  await runDkg(page)
  await completeRecoveryKit(page, "a-very-long-recovery-passphrase") // → create-pin

  const pin = page.locator("#pin")
  const confirm = page.locator("#confirm-pin")
  const submit = page.getByRole("button", { name: "Continue" })

  await pin.fill("123") // < 6 digits
  await expect(submit).toBeDisabled()

  await pin.fill("123456")
  await confirm.fill("654321")
  await expect(submit).toBeEnabled()
  await submit.click()
  await expect(page.getByRole("alert")).toBeVisible()
})
