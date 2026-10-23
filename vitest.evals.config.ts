import { defineConfig } from "vitest/config";

/**
 * Eval-only Vitest config. Separate from `vitest.config.ts` so `pnpm test` stays fast and
 * free (units only) while `pnpm evals` opts into the model/agent-driven suite under `evals/`.
 * Evals get a long timeout because a real agent run can take tens of seconds.
 * The replay env vars are read by `@vitest-evals/harness-pi-ai`: with a recording
 * present it replays tool results instead of calling them live, so reruns are cheap.
 */
export default defineConfig({
  test: {
    include: ["evals/**/*.eval.ts"],
    testTimeout: 120_000,
    env: {
      VITEST_EVALS_REPLAY_MODE: "auto",
      VITEST_EVALS_REPLAY_DIR: ".vitest-evals/recordings",
    },
  },
});
