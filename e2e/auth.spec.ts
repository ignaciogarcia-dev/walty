import { test, expect } from "@playwright/test"
import { uniqueEmail, E2E_PASSWORD } from "./helpers/email"
import { apiRegister, apiLogin } from "./helpers/api"

// Tier 2 — auth (register/login) validation at the API + the real form UI.
// Parallel; each test uses a unique email so the shared walty_e2e DB never collides.
test.describe("auth @tier2", () => {
  test("register: happy path sets a session", async ({ page }) => {
    await page.goto("/")
    const res = await apiRegister(page, uniqueEmail())
    expect(res.status()).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })

  test("register: rejects a duplicate email (409)", async ({ page }) => {
    await page.goto("/")
    const email = uniqueEmail()
    expect((await apiRegister(page, email)).status()).toBe(200)
    const dup = await apiRegister(page, email)
    expect(dup.status()).toBe(409)
    expect((await dup.json()).error).toBe("conflict")
  })

  test("register: rejects a short password (400)", async ({ page }) => {
    await page.goto("/")
    const res = await apiRegister(page, uniqueEmail(), { password: "short" })
    expect(res.status()).toBe(400)
    expect((await res.json()).error).toBe("validation_error")
  })

  test("login: happy path", async ({ page }) => {
    await page.goto("/")
    const email = uniqueEmail()
    await apiRegister(page, email)
    const res = await apiLogin(page, email)
    expect(res.status()).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })

  test("login: invalid credentials (401)", async ({ page }) => {
    await page.goto("/")
    const email = uniqueEmail()
    await apiRegister(page, email)
    const res = await apiLogin(page, email, "wrong-password-9999")
    expect(res.status()).toBe(401)
  })

  test("register UI: a fresh owner lands in onboarding (setup-business)", async ({ page }) => {
    await page.goto("/onboarding/register")
    await page.locator("#email").fill(uniqueEmail())
    await page.locator("#password").fill(E2E_PASSWORD)
    await page.getByRole("button", { name: "Register" }).click()
    // Fresh owner with no business → guard routes to setup-business.
    await page.waitForURL(/\/onboarding\/setup-business/, { timeout: 20_000 })
  })

  test("login UI: wrong credentials shows an error, stays on login", async ({ page }) => {
    const email = uniqueEmail()
    await page.goto("/") // bind cookie jar
    await apiRegister(page, email)
    // Log the API session out so the login page isn't redirected away by the guard.
    const logoutRes = await page.request.post("/api/auth/logout")
    if (!logoutRes.ok() && logoutRes.status() !== 401) {
      throw new Error(`Unexpected logout status: ${logoutRes.status()}`)
    }

    await page.goto("/onboarding/login")
    await page.locator("#email").fill(email)
    await page.locator("#password").fill("definitely-wrong-1")
    await page.getByRole("button", { name: "Login" }).click()
    await expect(page.getByRole("alert")).toBeVisible()
    await expect(page).toHaveURL(/\/onboarding\/login/)
  })
})
