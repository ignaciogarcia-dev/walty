import { test, expect } from "@playwright/test"
import { uniqueEmail } from "./helpers/email"
import { apiRegister, apiSetupBusiness, apiSession, registerUser } from "./helpers/api"

// Tier 2 — business setup: API validation + the real form UI + the session flag.
test.describe("business-setup @tier2", () => {
  test("API: rejects a name shorter than 2 chars (400)", async ({ page }) => {
    await page.goto("/")
    await apiRegister(page, uniqueEmail())
    const res = await apiSetupBusiness(page, "a")
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toBe("validation_error")
  })

  test("API: valid name sets hasBusinessSettings", async ({ page }) => {
    await page.goto("/")
    await apiRegister(page, uniqueEmail())
    expect((await apiSetupBusiness(page, "Acme Co")).status()).toBe(200)
    const sess = await (await apiSession(page)).json()
    expect(sess.user.hasBusinessSettings).toBe(true)
    expect(sess.business.name).toBe("Acme Co")
  })

  test("UI: submit disabled until name >= 2 chars; maxLength caps at 80", async ({ page }) => {
    await page.goto("/")
    await registerUser(page, uniqueEmail())
    await page.goto("/onboarding/setup-business")

    const submit = page.getByRole("button", { name: "Continue" })
    const input = page.locator("#businessName")
    await expect(submit).toBeDisabled()
    await input.fill("a")
    await expect(submit).toBeDisabled()
    await input.fill("Acme Co")
    await expect(submit).toBeEnabled()

    await input.fill("x".repeat(100))
    expect(await input.inputValue()).toHaveLength(80)
  })

  test("UI: valid setup advances to create-wallet + sets the session flag", async ({ page }) => {
    await page.goto("/")
    await registerUser(page, uniqueEmail())
    await page.goto("/onboarding/setup-business")
    await page.locator("#businessName").fill("My Shop")
    await page.getByRole("button", { name: "Continue" }).click()
    await page.waitForURL(/\/onboarding\/create-wallet/, { timeout: 20_000 })
    const sess = await (await apiSession(page)).json()
    expect(sess.user.hasBusinessSettings).toBe(true)
  })
})
