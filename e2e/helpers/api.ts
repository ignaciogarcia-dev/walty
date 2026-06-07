import type { Page, APIResponse } from "@playwright/test"
import { E2E_PASSWORD } from "./email"

// REST helpers that hit the real API through the web's /api/* rewrite, using
// `page.request` so the auth cookie lands in the page's context cookie jar —
// after these, `page.goto(...)` is authenticated. The fast path for Tier-2 specs
// that need a logged-in user without driving the register UI.

export function apiRegister(
  page: Page,
  email: string,
  opts: { password?: string; inviteToken?: string } = {},
): Promise<APIResponse> {
  return page.request.post("/api/auth/register", {
    data: {
      email,
      password: opts.password ?? E2E_PASSWORD,
      ...(opts.inviteToken ? { inviteToken: opts.inviteToken } : {}),
    },
  })
}

export function apiLogin(page: Page, email: string, password = E2E_PASSWORD): Promise<APIResponse> {
  return page.request.post("/api/auth/login", { data: { email, password } })
}

export function apiSetupBusiness(page: Page, name = "Acme Co"): Promise<APIResponse> {
  return page.request.post("/api/business/settings", { data: { name } })
}

export function apiSession(page: Page): Promise<APIResponse> {
  return page.request.get("/api/session")
}

/** Registers a fresh user (no business); returns the userId. Page left authenticated. */
export async function registerUser(page: Page, email: string): Promise<{ userId: number }> {
  const reg = await apiRegister(page, email)
  if (!reg.ok()) throw new Error(`register failed: ${reg.status()} ${await reg.text()}`)
  const sessRes = await apiSession(page)
  if (!sessRes.ok()) throw new Error(`session check failed: ${sessRes.status()}`)
  const sess = await sessRes.json()
  return { userId: sess.user.id as number }
}

/** Registers a fresh owner + a business; returns the userId. The page is left authenticated. */
export async function registerOwner(
  page: Page,
  email: string,
): Promise<{ userId: number }> {
  const reg = await apiRegister(page, email)
  if (!reg.ok()) throw new Error(`register failed: ${reg.status()} ${await reg.text()}`)
  const biz = await apiSetupBusiness(page)
  if (!biz.ok()) throw new Error(`business setup failed: ${biz.status()} ${await biz.text()}`)
  const sessRes = await apiSession(page)
  if (!sessRes.ok()) throw new Error(`session check failed: ${sessRes.status()}`)
  const sess = await sessRes.json()
  return { userId: sess.user.id as number }
}
