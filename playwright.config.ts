import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? "3000";
const baseURL = `http://127.0.0.1:${port}`;
// The API the web talks to (set by scripts/test-e2e.sh). The MPC socket reads
// NEXT_PUBLIC_API_BASE_URL at build time; the /api/* rewrite uses these at runtime.
const apiUrl = process.env.E2E_API_URL ?? "http://127.0.0.1:4000";

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	// CI: 1 worker for isolation. Local: 2 workers — DKG specs share a WebSocket
	// server and 90s WASM timeout; running more than 2 concurrently risks flaky
	// timeout failures on developer machines.
	workers: process.env.CI ? 1 : 2,
	reporter: process.env.CI ? "github" : "list",
	// Fails fast with a clear message if the stack isn't booted (run scripts/test-e2e.sh).
	globalSetup: "./e2e/global-setup.ts",
	use: {
		baseURL,
		trace: "on-first-retry",
		locale: "en-US",
		// Force English locale via the app's cookie (the app reads locale from
		// a "locale" cookie, not Accept-Language). Without this, tests run in
		// Spanish (the app default) and getByRole/getByText selectors break.
		storageState: "./e2e/locale-state.json",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: "pnpm start",
		url: baseURL,
		env: {
			PORT: port,
			JWT_SECRET: process.env.E2E_JWT_SECRET ?? "e2e-secret",
			API_INTERNAL_URL: apiUrl,
			NEXT_PUBLIC_API_BASE_URL: apiUrl,
		},
		// scripts/test-e2e.sh sets E2E_FRESH so Playwright always boots the
		// just-built server (never reuses a stale one — lethal after a rebuild).
		// Plain `pnpm test:e2e --ui` against an already-up stack still reuses.
		reuseExistingServer: !process.env.CI && !process.env.E2E_FRESH,
		timeout: 120_000,
		stdout: "pipe",
		stderr: "pipe",
	},
});
