import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		environment: "jsdom",
		globals: false,
		setupFiles: ["./vitest.setup.ts"],
		include: ["**/*.{test,spec}.{ts,tsx}"],
		exclude: ["node_modules", ".next", "e2e"],
	},
});
