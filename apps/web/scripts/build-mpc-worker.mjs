// Pre-bundles the MPC device worker into a self-contained ESM module served as a
// static asset at /mpc/mpcWorker.js.
//
// Why not `new Worker(new URL("./mpcWorker.ts", import.meta.url), {type:"module"})`?
// Under `next build` (Turbopack, Next 16) that emits the raw source as
// .next/static/media/mpcWorker.<hash>.ts, which `next start` serves with
// Content-Type: video/mp2t — a module worker refuses to execute a non-JS MIME, so
// the worker never loads and DKG/sign hang. Bundling to /public/mpc/mpcWorker.js
// (mirroring how the DKLS wasm is staged by `copy:wasm`) gives a stable URL with a
// correct JS MIME, independent of the bundler's worker handling.
//
// The worker fetches the WASM at runtime via the `init` message (MPC_WASM_URL ->
// /mpc/dkls-wasm-ll-web_bg.wasm), so no .wasm is bundled here.
import { build } from "esbuild"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(here, "..")

await build({
  entryPoints: [resolve(webRoot, "lib/mpc/mpcWorker.ts")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  legalComments: "linked",
  outfile: resolve(webRoot, "public/mpc/mpcWorker.js"),
})

console.log("[mpc] bundled public/mpc/mpcWorker.js")
