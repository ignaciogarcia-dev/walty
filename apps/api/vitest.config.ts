import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/**", "node_modules/**"],
    globals: false,
    // The MPC server-party tests drive real DKLS23 WASM (keygen / sign /
    // refresh) and can exceed the 5s default under CPU contention when several
    // run together. Match the integration suite's generous per-test budget.
    testTimeout: 30_000,
  },
})
