import { readFile } from "node:fs/promises"
import { test, expect, type Download } from "@playwright/test"
import { encryptSeedV3 } from "../apps/web/lib/crypto"
import { importBackupShare, type BackupExport } from "../apps/web/lib/mpc/backupShare"
import { registerOwner, apiLogin } from "./helpers/api"
import { uniqueEmail } from "./helpers/email"
import { completeMpcOnboarding, runDkg, completeRecoveryKit } from "./helpers/flows"
import { seedWalletBackup } from "./helpers/db"

const RECOVERY_PASSWORD = "correct-horse-battery-staple-2026"
const RECOVERY_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
const RECOVERY_PIN = "123456"

async function readDownloadJson(download: Download): Promise<BackupExport> {
  const filePath = await download.path()
  if (!filePath) {
    throw new Error("download path unavailable")
  }
  const raw = await readFile(filePath, "utf8")
  return JSON.parse(raw) as BackupExport
}

test.describe("recover @tier2", () => {
  test("MPC recovery kit download is a valid export artifact", async ({ page }) => {
    await page.goto("/")
    await registerOwner(page, uniqueEmail("owner"))

    await runDkg(page)
    const download = await completeRecoveryKit(page, RECOVERY_PASSWORD)

    const kit = await readDownloadJson(download)
    expect(kit.format).toBe("walty-backup-share-v1")
    expect(kit.ciphertext).toBeTruthy()
    expect(kit.iv).toBeTruthy()
    expect(kit.salt).toBeTruthy()

    const decrypted = await importBackupShare(kit, RECOVERY_PASSWORD)
    expect(decrypted.length).toBeGreaterThan(0)
    await expect(page).toHaveURL(/\/onboarding\/create-pin/)
  })

  test("PIN recovery decrypts a seeded EncryptedSeedV3 backup and lands on dashboard", async ({
    page,
    browser,
  }) => {
    await page.goto("/")
    const email = uniqueEmail("seed")
    const { userId } = await registerOwner(page, email)

    const backup = await encryptSeedV3(RECOVERY_MNEMONIC, RECOVERY_PIN)
    await seedWalletBackup(userId, backup)

    const freshContext = await browser.newContext()
    const freshPage = await freshContext.newPage()

    try {
      await freshPage.goto("/")
      const loginRes = await apiLogin(freshPage, email)
      expect(loginRes.status()).toBe(200)

      await freshPage.goto("/onboarding/recover")
      await expect(freshPage.locator("#pin")).toBeVisible({ timeout: 20_000 })

      await freshPage.locator("#pin").fill(RECOVERY_PIN)
      await freshPage.locator("form").locator("button[type='submit']").click()

      await expect(freshPage).toHaveURL(/\/dashboard(\/|$)/, { timeout: 30_000 })
      await expect(freshPage.locator("#unlock-pin")).toBeVisible({ timeout: 20_000 })
    } finally {
      await freshContext.close()
    }
  })

  test("wrong PIN on /onboarding/recover shows an error", async ({ page }) => {
    await page.goto("/")
    const email = uniqueEmail("wrong-pin")
    const { userId } = await registerOwner(page, email)

    const backup = await encryptSeedV3(RECOVERY_MNEMONIC, RECOVERY_PIN)
    await seedWalletBackup(userId, backup)

    await page.goto("/onboarding/recover")
    await expect(page.locator("#pin")).toBeVisible({ timeout: 20_000 })
    await page.locator("#pin").fill("000000") // wrong PIN
    await page.locator("form").locator("button[type='submit']").click()

    await expect(page.getByRole("alert")).toBeVisible({ timeout: 20_000 })
    // Should remain on the recover page, not navigate to dashboard
    await expect(page).toHaveURL(/\/onboarding\/recover/)
  })

  test("untrusted device enters the pairing wait state instead of recovering immediately", async ({
    page,
    browser,
  }) => {
    await page.goto("/")
    const email = uniqueEmail("pairing")
    const pin = "654321"

    await registerOwner(page, email)
    await completeMpcOnboarding(page, { pin })

    const untrustedContext = await browser.newContext()
    const untrustedPage = await untrustedContext.newPage()

    try {
      await untrustedPage.goto("/")
      const loginRes = await apiLogin(untrustedPage, email)
      expect(loginRes.status()).toBe(200)

      await untrustedPage.goto("/onboarding/recover")
      await expect(untrustedPage.locator("#pin")).toBeVisible({ timeout: 20_000 })

      await untrustedPage.locator("#pin").fill(pin)
      await untrustedPage.locator("form").locator("button[type='submit']").click()

      await expect(untrustedPage.getByTestId("pairing-wait")).toBeVisible({ timeout: 20_000 })
    } finally {
      await untrustedContext.close()
    }
  })
})
