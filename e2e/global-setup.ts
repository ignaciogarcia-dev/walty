import type { FullConfig } from "@playwright/test"

// Fails fast (with a clear message) if the e2e stack isn't booted. The suite is
// meant to be run via scripts/test-e2e.sh, which boots Postgres + API + the web
// build and exports E2E_API_URL / E2E_DATABASE_URL.
export default async function globalSetup(_config: FullConfig): Promise<void> {
  const apiUrl = process.env.E2E_API_URL ?? "http://127.0.0.1:4000"
  const dbUrl = process.env.DATABASE_URL ?? ""

  // Defense-in-depth: the test process's @walty/db must point at a LOCAL DB,
  // never the .env Supabase prod DB. Refuse otherwise.
  if (dbUrl) {
    const { hostname } = new URL(dbUrl.replace(/^postgres(ql)?/, "http"))
    if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
      throw new Error(
        `[e2e] refusing to run: DATABASE_URL hostname is not local (${hostname}). Use scripts/test-e2e.sh.`,
      )
    }
  }

  let ok = false
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${apiUrl}/session`)
      if (res.status === 401 || res.ok) {
        ok = true
        break
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  if (!ok) {
    throw new Error(
      `[e2e] API not reachable at ${apiUrl}. Boot the stack with: scripts/test-e2e.sh`,
    )
  }
}
