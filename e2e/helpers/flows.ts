import { type Page, type Download } from "@playwright/test"

// UI-driving helpers for the onboarding wallet steps. DKG completion is signalled
// by the create-wallet page replacing to recovery-kit (a real transition, not a
// spinner) — wait on the URL.

/** create-wallet auto-runs the 2-of-3 DKG, then replaces to recovery-kit. */
export async function runDkg(page: Page): Promise<void> {
  await page.goto("/onboarding/create-wallet")
  await page.waitForURL("**/onboarding/recovery-kit", { timeout: 90_000 })
}

/** Fill + confirm the recovery password, download the kit, continue to create-pin. */
export async function completeRecoveryKit(
  page: Page,
  recoveryPassword: string,
): Promise<Download> {
  await page.locator("#recovery-password").fill(recoveryPassword)
  await page.locator("#recovery-password-confirm").fill(recoveryPassword)
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download recovery kit" }).click(),
  ])
  await page.getByRole("button", { name: "I've saved it, continue" }).click()
  await page.waitForURL("**/onboarding/create-pin", { timeout: 15_000 })
  return download
}

/** Fill PIN + confirm and submit (saves the device share / links the wallet). */
export async function setPin(page: Page, pin: string): Promise<void> {
  await page.locator("#pin").fill(pin)
  await page.locator("#confirm-pin").fill(pin)
  await page.getByRole("button", { name: "Continue" }).click()
}

/** Full MPC owner onboarding: DKG → recovery kit → PIN → dashboard. */
export async function completeMpcOnboarding(
  page: Page,
  opts: { recoveryPassword?: string; pin?: string } = {},
): Promise<void> {
  await runDkg(page)
  await completeRecoveryKit(page, opts.recoveryPassword ?? "a-very-long-recovery-passphrase")
  await setPin(page, opts.pin ?? "123456")
  await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 30_000 })
}

/** Enter a PIN into the dashboard LockScreen and submit. */
export async function unlock(page: Page, pin: string): Promise<void> {
  // Wait for the LockScreen to actually mount: the dashboard resolves
  // loading→locked asynchronously (determineWalletStatus), so filling too early
  // races a re-render that drops the typed PIN.
  await page.locator("#unlock-pin").waitFor({ state: "visible" })
  await page.locator("#unlock-pin").fill(pin)
  await page.getByRole("button", { name: "Unlock wallet" }).click()
}
