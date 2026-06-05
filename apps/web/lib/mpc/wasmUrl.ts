// Same-origin URL for the DKLS web wasm, copied to public/mpc at build time
// (see the `copy:wasm` step). Passed to `initMpcWasm` so loading never depends
// on bundler-specific resolution of a `.wasm` import (Turbopack treats one as a
// module, esbuild as a file URL).
export const MPC_WASM_URL = "/mpc/dkls-wasm-ll-web_bg.wasm"
