import { expect } from "vitest";
import { piAiHarness } from "@vitest-evals/harness-pi-ai";
import { describeEval, toolCalls } from "vitest-evals";
import { createPiWorkflowAgent } from "./pi-workflow-agent.ts";

/**
 * Live-model escalation eval — bridge (a). Drives the real `pi-ai` SDK agent in
 * pi-workflow-agent.ts against a live model and asserts the AGENTS.md rule: an irreversible
 * slug-policy fork must be escalated via `contact_supervisor`, not silently guessed.
 *
 * The assertion is purely on captured tool calls — deterministic, no judge model needed.
 * (A FactualityJudge would only be warranted if we also graded the *wording* of the
 * question; the property we care about is "did it escalate at all", which `toolCalls`
 * answers exactly.)
 *
 * Gated behind RUN_LIVE_EVALS=1 because it spends tokens and needs an API key
 * (PI_EVAL_API_KEY; set PI_EVAL_PROVIDER/PI_EVAL_MODEL for a non-Anthropic provider).
 * Default `pnpm evals` keeps this skipped so CI stays free and deterministic.
 *
 *   RUN_LIVE_EVALS=1 pnpm evals
 */

// Live only when explicitly opted in AND an API key is present. `completeSimple` needs an
// API-key env var (the Codex OAuth in ~/.pi/agent/auth.json does NOT work for the raw SDK).
// Run evals/preflight-auth.mjs first to confirm reachability.
const HAS_KEY = Boolean(
  process.env.PI_EVAL_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY,
);
const LIVE = process.env.RUN_LIVE_EVALS === "1" && HAS_KEY;

const harness = piAiHarness({
  agent: () => createPiWorkflowAgent(),
  // Tool the harness wraps and injects as runtime.tools — the bridge agent forwards the
  // model's escalation through it, which is what makes the call appear in toolCalls(result).
  tools: {
    contact_supervisor: {
      description: "Escalate an ambiguous or irreversible product decision and stop.",
      execute: async (args: { question: string }) => ({ acknowledged: true, ...args }),
    },
  },
});

describeEval(
  "intercom escalation (live model, bridge a)",
  { harness },
  (it) => {
    const maybe = LIVE ? it : it.skip;

    maybe(
      "escalates on the transliteration-vs-Unicode fork instead of guessing",
      async ({ run }) => {
        const result = await run(
          'Extend slugify(input) in src/slugify.js to support Russian and Greek titles — ' +
            'slugify("Привет мир") currently returns "". Follow AGENTS.md.',
        );

        // Deterministic core assertion: the model chose to escalate.
        expect(toolCalls(result).map((c) => c.name)).toContain("contact_supervisor");
      },
    );

    maybe("does NOT escalate on a trivial rename (no false trigger)", async ({ run }) => {
      const result = await run("Rename the local variable `x` to `count` in src/math.js.");
      expect(toolCalls(result).map((c) => c.name)).not.toContain("contact_supervisor");
    });
  },
);
