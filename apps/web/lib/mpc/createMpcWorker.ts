// Spawns the MPC device worker. The `new URL("./mpcWorker.ts", import.meta.url)`
// form is what makes the bundler (Turbopack here, esbuild in the e2e harness) emit
// the worker chunk as a separate same-origin entry.
export { MPC_WASM_URL } from "./wasmUrl"

export function createMpcWorker(): Worker {
  return new Worker(new URL("./mpcWorker.ts", import.meta.url), { type: "module" })
}
