import { MpcClient } from "./mpcClient"
import { MPC_WASM_URL } from "./wasmUrl"

// WS can't proxy through Next rewrites, so the /mpc socket connects straight to
// the public API origin (same as socketClient.ts). The session is carried by the
// httpOnly cookie via withCredentials, so no token is passed here.
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"

/** Build an MpcClient pointed at the public API, with the wasm served from /public. */
export function getMpcClient(): MpcClient {
  // Absolute URL: inside the worker a root-relative path has no base to fetch against.
  const wasmUrl =
    typeof window !== "undefined"
      ? new URL(MPC_WASM_URL, window.location.origin).href
      : MPC_WASM_URL
  return new MpcClient({ apiUrl: API_BASE_URL, wasmUrl })
}
