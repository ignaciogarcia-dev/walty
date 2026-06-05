/**
 * Device spike driver. Bundles page.ts + deviceWorker.ts with esbuild, serves
 * them on a plain localhost origin (NO COOP/COEP), launches headless chromium
 * via Playwright, waits for window.__DEVICE_SPIKE_RESULT__, and prints a
 * PASS/FAIL summary. Exits non-zero on any failure.
 *
 * This exercises the PRODUCTION MpcDeviceParty + the real bundle codec inside a
 * Web Worker, driven against an in-page server simulation, running a full
 * DKG → sign → refresh → sign-after-refresh entirely in the browser.
 *
 * Run:
 *   pnpm -F @walty/web exec tsx scripts/mpc-device-spike/run.ts
 */
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdtemp, copyFile, rm, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
import { startServer } from "../mpc-web-spike/server.js"

const execFileP = promisify(execFile)
const HERE = dirname(fileURLToPath(import.meta.url))
const ESBUILD = resolve(HERE, "../../node_modules/esbuild/bin/esbuild")

type Check = { label: string; ok: boolean; detail?: string }
type SpikeResult = {
  pass: boolean
  error?: string
  env?: { crossOriginIsolated: boolean | null; hasSharedArrayBuffer: boolean }
  dkgAddress?: string
  dkgPubkey?: string
  checks?: Check[]
  failures?: Check[]
}

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

async function main() {
  const outDir = await mkdtemp(join(tmpdir(), "mpc-device-spike-"))
  try {
    console.log("Bundling page + worker with esbuild ->", outDir)
    await bundle("page.ts", "page.bundle.js", outDir)
    await bundle("deviceWorker.ts", "deviceWorker.bundle.js", outDir)
    await copyFile(join(HERE, "index.html"), join(outDir, "index.html"))
    const emitted = await readdir(outDir)
    console.log("Bundle dir contents:", emitted.join(", "))
    const wasm = emitted.find((f) => f.endsWith(".wasm"))
    if (!wasm) throw new Error("esbuild did not emit the _bg.wasm asset")

    const { server, url } = await startServer(outDir, { withIsolation: false })
    const browser = await chromium.launch({ headless: true })
    let result: SpikeResult
    try {
      const page = await browser.newPage()
      const lines: string[] = []
      page.on("console", (m) => lines.push(`[console:${m.type()}] ${m.text()}`))
      page.on("pageerror", (e) => lines.push(`[pageerror] ${e.message}`))
      await page.goto(url, { waitUntil: "load" })
      await page.waitForFunction(
        () => (window as any).__DEVICE_SPIKE_RESULT__ != null,
        { timeout: 120_000 },
      )
      result = (await page.evaluate(
        () => (window as any).__DEVICE_SPIKE_RESULT__,
      )) as SpikeResult
      if (lines.length && (!result || !result.pass)) console.log(lines.join("\n"))
    } finally {
      await browser.close()
      server.close()
    }

    console.log("\n========== MpcDeviceParty BROWSER SPIKE (plain origin) ==========")
    if (result.error) console.log("ERROR:", result.error)
    if (result.env) {
      console.log("env.crossOriginIsolated  :", result.env.crossOriginIsolated)
      console.log("env.hasSharedArrayBuffer :", result.env.hasSharedArrayBuffer)
    }
    if (result.dkgAddress) console.log("DKG address :", result.dkgAddress)
    if (result.checks) {
      console.log("--- assertions ---")
      for (const c of result.checks) {
        console.log(
          `  ${c.ok ? "PASS" : "FAIL"}  ${c.label}${c.detail ? "  — " + c.detail : ""}`,
        )
      }
    }
    console.log(`RESULT: ${result.pass ? "PASS" : "FAIL"}`)
    if (!result.pass) process.exitCode = 1
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error("DRIVER CRASHED:", e)
  process.exit(1)
})
