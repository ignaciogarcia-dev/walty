import { test, expect } from "@playwright/test"
import { uniqueEmail } from "./helpers/email"
import { registerOwner } from "./helpers/api"
import { findActiveMpcKey, hasServerShare } from "./helpers/db"
import { runDkg, completeRecoveryKit, setPin } from "./helpers/flows"

// Tier 1 — the real MPC owner onboarding, end-to-end in a browser (DKG over the
// /mpc socket + WASM worker). Serial: each runs a real DKG.
test.describe.configure({ mode: "serial" })

test("create-wallet runs DKG, persists an active key, lands on recovery-kit @tier1", async ({ page }) => {
  await page.goto("/")
  const { userId } = await registerOwner(page, uniqueEmail())

  await runDkg(page)
  await expect(page).toHaveURL(/\/onboarding\/recovery-kit/)

  // DB: the DKG persisted the owner's MPC key + the encrypted server share.
  const key = await findActiveMpcKey(userId)
  expect(key, "active mpc_keys row after DKG").toBeTruthy()
  expect(await hasServerShare(key!.id), "mpc_server_shares row present").toBe(true)
})

test("full onboarding: DKG → recovery kit → PIN → dashboard @tier1", async ({ page }) => {
  await page.goto("/")
  await registerOwner(page, uniqueEmail())

  await runDkg(page)
  const download = await completeRecoveryKit(page, "a-very-long-recovery-passphrase")
  expect(download.suggestedFilename()).toBe("walty-recovery-kit.json")

  await setPin(page, "123456")
  // /dashboard redirects to /dashboard/home (next.config), so match the segment.
  await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 30_000 })
})
