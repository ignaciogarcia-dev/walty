import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // shadcn/ui generated files — suppress false-positive compiler rules
  {
    files: ["components/ui/**"],
    rules: {
      "react-hooks/purity": "off",
    },
  },
  // Ignore intentionally-unused args prefixed with _ (TypeScript convention)
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // MPC spike / proof harnesses — standalone eval tooling (tsx/esbuild/Playwright),
    // not part of the app build or lint.
    "scripts/**",
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
    "coverage/**",
  ]),
]);

export default eslintConfig;
