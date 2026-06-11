import { readFile } from "node:fs/promises"
import { test, expect, type Download } from "@playwright/test"
import { importBackupShare, type BackupExport } from "../apps/web/lib/mpc/backupShare"
import { registerOwner } from "./helpers/api"
import { uniqueEmail } from "./helpers/email"
import { runDkg, completeRecoveryKit } from "./helpers/flows"

const RECOVERY_PASSWORD = "correct-horse-battery-staple-2026"

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
})
