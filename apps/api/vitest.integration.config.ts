import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    // Real DB shared across the file — run serially per file so beforeEach
    // truncates don't race other workers.
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    globals: false,
    testTimeout: 20_000,
  },
})
