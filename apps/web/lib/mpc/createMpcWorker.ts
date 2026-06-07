// Spawns the MPC device worker from the pre-bundled static asset — consistent
// with defaultCreateWorker() in mpcClient.ts. Do NOT use import.meta.url here:
// Turbopack emits the raw .ts chunk as video/mp2t which module workers refuse.
export { MPC_WASM_URL } from "./wasmUrl"

export function createMpcWorker(): Worker {
  const url =
    typeof window !== "undefined"
      ? new URL("/mpc/mpcWorker.js", window.location.origin).href
      : "/mpc/mpcWorker.js"
  return new Worker(url, { type: "module" })
}
