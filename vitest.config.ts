import { defineConfig } from "vitest/config";

/**
 * Unit tests only (`src/**.test.js`): deterministic, no model cost. Evals live under
 * `evals/` and run through `vitest.evals.config.ts` via `pnpm evals` because they
 * drive a model and cost tokens.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.{js,ts}"],
  },
});
