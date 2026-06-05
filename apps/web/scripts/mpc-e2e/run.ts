/**
 * LIVE end-to-end MPC proof: a REAL headless-chromium browser running the
 * PRODUCTION client driver (lib/mpc/mpcClient.ts) talks to a REAL running API
 * server over socket.io `/mpc`, driving a full
 *   DKG → sign(device+server) → refresh → post-refresh sign
 * over the actual network path. Each signature is recoverAddress'd against the
 * DKG address (viem) and the persisted mpc_keys row is asserted active.
 *
 * What is real here:
 *   - the API: createApp() + initWebSocket() listening on a TCP port, with the
 *     real Ceremony orchestrator + MpcServerParty WASM and the real /mpc auth
 *     middleware (JWT sid → live device_sessions row).
 *   - the DB: local `walty_test` ONLY (postgresql://wallet:wallet@localhost:5432).
 *   - the browser: chromium loads an esbuild bundle of page.ts + mpcWorker.ts on
 *     a plain origin; the production MpcDeviceParty + WASM run in a Web Worker.
 *
 * Auth: we seed a user + device_session directly in walty_test and mint a
 * session JWT (sid) — the same token shape the app issues — handed to the
 * browser via window.__MPC_E2E_CONFIG__ and sent in the socket.io `auth` field.
 *
 * NEVER touches the .env Supabase DB. Run:
 *   pnpm -F @walty/web exec tsx scripts/mpc-e2e/run.ts
 */
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdtemp, copyFile, rm, readdir, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { createServer, type Server as HttpServer } from "node:http"
import { dirname, join, resolve, extname, normalize } from "node:path"
import { fileURLToPath } from "node:url"
import { randomBytes } from "node:crypto"
import { chromium } from "playwright"

const execFileP = promisify(execFile)
const HERE = dirname(fileURLToPath(import.meta.url))
const ESBUILD = resolve(HERE, "../../node_modules/esbuild/bin/esbuild")

const TEST_DB_URL =
  process.env.MPC_E2E_DATABASE_URL ??
  "postgresql://wallet:wallet@localhost:5432/walty_test"

// ---------------------------------------------------------------------------
// Static file server (plain origin, no COOP/COEP).
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".map": "application/json",
}

function startStaticServer(
  rootDir: string,
): Promise<{ server: HttpServer; url: string }> {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0])
      const rel = urlPath === "/" ? "/index.html" : urlPath
      const filePath = normalize(join(rootDir, rel))
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403).end("forbidden")
        return
      }
      const data = await readFile(filePath)
      res
        .writeHead(200, {
          "Content-Type": MIME[extname(filePath)] || "application/octet-stream",
          "Cache-Control": "no-store",
        })
        .end(data)
    } catch {
      res.writeHead(404).end("not found")
    }
  })
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address()
      const port = typeof addr === "object" && addr ? addr.port : 0
      resolve({ server, url: `http://127.0.0.1:${port}/` })
    })
  })
}

// ---------------------------------------------------------------------------
// esbuild bundling (page + worker), emitting the _bg.wasm asset.
// ---------------------------------------------------------------------------

async function bundle(entry: string, outFile: string, outDir: string) {
  await execFileP(ESBUILD, [
    join(HERE, entry),
    "--bundle",
    "--format=esm",
    "--platform=browser",
    "--loader:.wasm=file",
    "--asset-names=[name]",
    "--target=es2022",
    `--outfile=${join(outDir, outFile)}`,
  ])
}

// ---------------------------------------------------------------------------
// Result shape posted by the page.
// ---------------------------------------------------------------------------

type Check = { label: string; ok: boolean; detail?: string }
type E2eResult = {
  pass: boolean
  error?: string
  keyId?: string
  dkgAddress?: string
  dkgPubkey?: string
  checks?: Check[]
  failures?: Check[]
}

async function main() {
  // 1) Wire env BEFORE importing the API (env.ts reads at module load). Point
  //    the DB at walty_test ONLY, set the dev KEK, and a JWT secret.
  const JWT_SECRET = process.env.JWT_SECRET ?? "mpc-e2e-secret"
  const procEnv = process.env as Record<string, string | undefined>
  procEnv.DATABASE_URL = TEST_DB_URL
  procEnv.JWT_SECRET = JWT_SECRET
  procEnv.NODE_ENV = "test"
  procEnv.APP_ENV = "development"
  procEnv.WORKERS_ENABLED = "false"
  procEnv.LOG_LEVEL = process.env.LOG_LEVEL ?? "silent"
  procEnv.MPC_KMS_DEV_KEK =
    process.env.MPC_KMS_DEV_KEK ?? randomBytes(32).toString("base64")

  // 2) Bundle page + worker.
  const outDir = await mkdtemp(join(tmpdir(), "mpc-e2e-"))
  let staticServer: HttpServer | null = null
  let apiServer: HttpServer | null = null
  try {
    console.log("Bundling page + worker with esbuild ->", outDir)
    await bundle("page.ts", "page.bundle.js", outDir)
    await bundle("mpcWorker.ts", "mpcWorker.bundle.js", outDir)
    await copyFile(join(HERE, "index.html"), join(outDir, "index.html"))
    const emitted = await readdir(outDir)
    if (!emitted.some((f) => f.endsWith(".wasm")))
      throw new Error("esbuild did not emit the _bg.wasm asset")
    console.log("Bundle dir:", emitted.join(", "))

    // 3) Serve the bundle on a plain origin; learn its URL so we can allow it
    //    as the API CORS origin BEFORE the API module is imported.
    const stat = await startStaticServer(outDir)
    staticServer = stat.server
    const pageOrigin = stat.url.replace(/\/$/, "")
    procEnv.WEB_ORIGIN = pageOrigin
    console.log("Static page origin:", pageOrigin)

    // 4) Boot the REAL API + websocket on an ephemeral port (dynamic import so
    //    the env above is in place when config/env.ts evaluates).
    const { createApp } = await import("../../../api/src/app.js")
    const { initWebSocket, closeWebSocket } = await import("../../../api/src/ws/io.js")
    const dbModule = await import("@walty/db")
    const { db, users, deviceSessions, mpcKeys, mpcServerShares } = dbModule
    const { signSessionToken } = await import(
      "@walty/shared/auth/session-token"
    )

    const app = createApp()
    await new Promise<void>((res) => {
      apiServer = app.listen(0, "127.0.0.1", () => res())
    })
    initWebSocket(apiServer!)
    const apiAddr = apiServer!.address()
    const apiPort = typeof apiAddr === "object" && apiAddr ? apiAddr.port : 0
    const apiUrl = `http://127.0.0.1:${apiPort}`
    console.log("API server:", apiUrl, "  DB:", TEST_DB_URL)

    // 5) Seed a user + (untrusted) device session in walty_test, mint a token.
    const [user] = await db
      .insert(users)
      .values({
        email: `mpc-e2e-${Date.now()}-${Math.random()}@example.com`,
        passwordHash: "x",
      })
      .returning()
    const [session] = await db
      .insert(deviceSessions)
      .values({ userId: user.id, label: "mpc-e2e" })
      .returning()
    const token = signSessionToken({ userId: user.id, sid: session.id })

    // Resolve the wasm asset URL on the static origin so the worker can fetch it
    // same-origin (the page bundle imports it; the worker bundle emits its own).
    const wasmFile = (await readdir(outDir)).find((f) => f.endsWith(".wasm"))!
    const wasmUrl = `${pageOrigin}/${wasmFile}`

    // 6) Drive the browser.
    const browser = await chromium.launch({ headless: true })
    let result: E2eResult
    try {
      const page = await browser.newPage()
      const lines: string[] = []
      page.on("console", (m) => lines.push(`[console:${m.type()}] ${m.text()}`))
      page.on("pageerror", (e) => lines.push(`[pageerror] ${e.message}`))
      await page.addInitScript(
        (cfg) => {
          ;(window as unknown as { __MPC_E2E_CONFIG__: unknown }).__MPC_E2E_CONFIG__ =
            cfg
        },
        { apiUrl, token, wasmUrl },
      )
      await page.goto(pageOrigin + "/", { waitUntil: "load" })
      await page.waitForFunction(
        () => (window as unknown as { __MPC_E2E_RESULT__?: unknown }).__MPC_E2E_RESULT__ != null,
        { timeout: 120_000 },
      )
      result = (await page.evaluate(
        () => (window as unknown as { __MPC_E2E_RESULT__: E2eResult }).__MPC_E2E_RESULT__,
      )) as E2eResult
      if (!result || !result.pass) console.log(lines.join("\n"))
    } finally {
      await browser.close()
    }

    // 7) Assert the persisted key row in walty_test.
    let dbCheckOk = false
    let dbDetail = ""
    if (result.keyId) {
      const row = await db.query.mpcKeys.findFirst({
        where: (k, { eq }) => eq(k.id, result.keyId!),
      })
      const shareRow = await db.query.mpcServerShares.findFirst({
        where: (s, { eq }) => eq(s.keyId, result.keyId!),
      })
      dbCheckOk =
        !!row &&
        row.userId === user.id &&
        row.status === "active" &&
        row.address.toLowerCase() === (result.dkgAddress ?? "").toLowerCase() &&
        !!shareRow
      dbDetail = row
        ? `status=${row.status} version=${row.version} share=${shareRow ? "present" : "missing"}`
        : "mpc_keys row missing"
      // refresh bumped the version → expect version 2 after the refresh step.
      if (row && row.version < 2) dbDetail += " (warn: expected version>=2 after refresh)"
      void mpcKeys
      void mpcServerShares
    }

    // 8) Report.
    console.log("\n========== MPC LIVE E2E (browser ↔ real /mpc server) ==========")
    if (result.error) console.log("ERROR:", result.error)
    if (result.dkgAddress) console.log("DKG address :", result.dkgAddress)
    if (result.keyId) console.log("keyId       :", result.keyId)
    console.log("--- browser assertions ---")
    for (const c of result.checks ?? []) {
      console.log(
        `  ${c.ok ? "PASS" : "FAIL"}  ${c.label}${c.detail ? "  — " + c.detail : ""}`,
      )
    }
    console.log("--- server-side DB assertion ---")
    console.log(
      `  ${dbCheckOk ? "PASS" : "FAIL"}  mpc_keys row persisted + active + share present  — ${dbDetail}`,
    )

    const pass = !!result.pass && dbCheckOk
    console.log(`\nRESULT: ${pass ? "PASS" : "FAIL"}`)

    await closeWebSocket()
    if (!pass) process.exitCode = 1
  } finally {
    if (apiServer) await new Promise<void>((r) => apiServer!.close(() => r()))
    if (staticServer) staticServer.close()
    await rm(outDir, { recursive: true, force: true })
    // The pg pool keeps the event loop alive; force a clean exit after report.
    setTimeout(() => process.exit(process.exitCode ?? 0), 250).unref()
  }
}

main().catch((e) => {
  console.error("DRIVER CRASHED:", e)
  process.exit(1)
})
