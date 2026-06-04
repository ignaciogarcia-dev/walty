/**
 * Spike driver. Bundles worker.ts (esbuild), serves it on a plain localhost
 * origin with NO COOP/COEP, launches headless chromium via Playwright, waits
 * for window.__SPIKE_RESULT__, and prints a PASS/FAIL summary. Exits non-zero
 * on any failure.
 *
 * Optionally re-runs WITH COOP/COEP (isolation) to prove it doesn't break.
 *
 * Run:
 *   pnpm -F @walty/web exec tsx scripts/mpc-web-spike/run.ts
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, copyFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startServer } from "./server.js";

const execFileP = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ESBUILD = resolve(
  HERE,
  "../../node_modules/esbuild/bin/esbuild",
);

type SpikeResult = {
  pass: boolean;
  error?: string;
  env?: {
    hasSharedArrayBuffer: boolean;
    crossOriginIsolated: boolean | null;
    isWorker: boolean;
    wasmUrl: string;
  };
  timings?: Record<string, number | number[]>;
  dkgAddress?: string;
  pubkey?: string;
  memUsedJSHeapBefore?: number | null;
  memUsedJSHeapAfter?: number | null;
  memDeltaBytes?: number | null;
  wasmBytesBefore?: number | null;
  wasmBytesAfter?: number | null;
  wasmGrowthBytes?: number | null;
  checks?: { label: string; ok: boolean; detail?: string }[];
  failures?: { label: string; ok: boolean; detail?: string }[];
};

function fmt(n: number | undefined): string {
  return n == null ? "n/a" : `${n.toFixed(1)}ms`;
}
function avg(a: number[]): number {
  return a.reduce((x, y) => x + y, 0) / a.length;
}

async function bundleWorker(outDir: string) {
  const entry = join(HERE, "worker.ts");
  const out = join(outDir, "worker.bundle.js");
  // Bundle the worker (SL package + viem) into one browser ESM module.
  // .wasm => file loader emits the asset and resolves the import to its URL.
  await execFileP(ESBUILD, [
    entry,
    "--bundle",
    "--format=esm",
    "--platform=browser",
    "--loader:.wasm=file",
    "--asset-names=[name]",
    "--target=es2022",
    `--outfile=${out}`,
  ]);
}

async function runOnce(
  outDir: string,
  withIsolation: boolean,
): Promise<SpikeResult> {
  const { server, url } = await startServer(outDir, { withIsolation });
  const browser = await chromium.launch({
    headless: true,
    // expose performance.memory for the heap sampling objective.
    args: ["--enable-precise-memory-info"],
  });
  try {
    const page = await browser.newPage();
    const consoleLines: string[] = [];
    page.on("console", (m) => consoleLines.push(`[console:${m.type()}] ${m.text()}`));
    page.on("pageerror", (e) => consoleLines.push(`[pageerror] ${e.message}`));
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => (window as any).__SPIKE_RESULT__ != null, {
      timeout: 120_000,
    });
    const result = (await page.evaluate(
      () => (window as any).__SPIKE_RESULT__,
    )) as SpikeResult;
    if (consoleLines.length && (!result || !result.pass)) {
      console.log(consoleLines.join("\n"));
    }
    return result;
  } finally {
    await browser.close();
    server.close();
  }
}

function printReport(r: SpikeResult, label: string) {
  console.log(`\n========== ${label} ==========`);
  if (r.error) {
    console.log("ERROR:", r.error);
  }
  if (r.env) {
    console.log("env.isWorker             :", r.env.isWorker);
    console.log("env.hasSharedArrayBuffer :", r.env.hasSharedArrayBuffer);
    console.log("env.crossOriginIsolated  :", r.env.crossOriginIsolated);
    console.log("env.wasmUrl              :", r.env.wasmUrl);
  }
  if (r.timings) {
    const t = r.timings;
    console.log("timing init   :", fmt(t.initMs as number));
    console.log("timing DKG    :", fmt(t.dkgMs as number),
      Array.isArray(t.dkgSamplesMs) ? `(samples avg ${avg(t.dkgSamplesMs as number[]).toFixed(1)}ms)` : "");
    console.log("timing sign   :", fmt(t.signMs as number),
      Array.isArray(t.signLoopMs) ? `(loop avg ${avg(t.signLoopMs as number[]).toFixed(1)}ms, n=${(t.signLoopMs as number[]).length})` : "");
    console.log("timing refresh:", fmt(t.refreshMs as number),
      Array.isArray(t.refreshSamplesMs) ? `(samples avg ${avg(t.refreshSamplesMs as number[]).toFixed(1)}ms)` : "");
  }
  if (r.dkgAddress) console.log("DKG address   :", r.dkgAddress);
  console.log(
    "JS heap delta over sign loop:",
    r.memDeltaBytes == null ? "n/a (performance.memory not exposed in worker)" : `${(r.memDeltaBytes / 1024).toFixed(1)} KiB`,
  );
  console.log(
    "WASM linear memory over sign loop:",
    r.wasmGrowthBytes == null
      ? "n/a"
      : `grew ${(r.wasmGrowthBytes / 1024).toFixed(0)} KiB ` +
        `(before=${((r.wasmBytesBefore ?? 0) / 1048576).toFixed(1)}MiB after=${((r.wasmBytesAfter ?? 0) / 1048576).toFixed(1)}MiB)`,
  );
  if (r.checks) {
    console.log("--- assertions ---");
    for (const c of r.checks) {
      console.log(
        `  ${c.ok ? "PASS" : "FAIL"}  ${c.label}${c.detail ? "  — " + c.detail : ""}`,
      );
    }
  }
  console.log(`RESULT: ${r.pass ? "PASS" : "FAIL"}`);
}

async function main() {
  const outDir = await mkdtemp(join(tmpdir(), "mpc-web-spike-"));
  try {
    console.log("Bundling worker with esbuild ->", outDir);
    await bundleWorker(outDir);
    await copyFile(join(HERE, "index.html"), join(outDir, "index.html"));
    const emitted = await readdir(outDir);
    console.log("Bundle dir contents:", emitted.join(", "));
    const wasm = emitted.find((f) => f.endsWith(".wasm"));
    if (!wasm) throw new Error("esbuild did not emit the _bg.wasm asset");
    console.log("Same-origin wasm asset present:", wasm);

    // Objective 3: plain origin, NO COOP/COEP.
    const plain = await runOnce(outDir, false);
    printReport(plain, "PLAIN ORIGIN (no COOP/COEP)");

    // Optional: with isolation, prove it doesn't break.
    let isolated: SpikeResult | null = null;
    try {
      isolated = await runOnce(outDir, true);
      printReport(isolated, "ISOLATED ORIGIN (COOP+COEP)");
    } catch (e) {
      console.log("\n(isolated re-run skipped/failed:", (e as Error).message, ")");
    }

    console.log("\n================ VERDICT ================");
    const coi = plain.env?.crossOriginIsolated;
    const sab = plain.env?.hasSharedArrayBuffer;
    if (plain.pass && coi === false) {
      console.log(
        "current-app VIABLE: DKG/sign/refresh all succeeded in a Web Worker on a",
      );
      console.log(
        "plain origin with crossOriginIsolated=false => no COOP/COEP, no threading.",
      );
    } else if (plain.pass && coi !== false) {
      console.log(
        "PASS but crossOriginIsolated was not false — re-check headers/origin.",
      );
    } else {
      console.log("FAILED on plain origin — see assertions/errors above.");
    }
    console.log("SharedArrayBuffer present in worker:", sab);
    console.log(
      "isolated re-run pass:",
      isolated ? isolated.pass : "(not run)",
    );

    if (!plain.pass) process.exitCode = 1;
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error("DRIVER CRASHED:", e);
  process.exit(1);
});
