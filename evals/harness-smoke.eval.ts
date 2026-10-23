import { expect } from "vitest";
import { piAiHarness } from "@vitest-evals/harness-pi-ai";
import { describeEval, toolCalls } from "vitest-evals";

/**
 * Spike eval #1 — prove the harness mechanics WITHOUT a live model.
 *
 * Purpose of the spike (per docs/vitest-evals-for-pi-workflow.md §6): confirm that
 * `piAiHarness` runs an agent's `run(input, runtime)`, that tools called via
 * `runtime.tools.*` are captured, and that `result.output` / `toolCalls(result)` are
 * shaped as the docs claim. A scripted fake agent is enough to verify all of that — and
 * it costs zero tokens, so it could run in CI on every push.
 *
 * It also models our REAL assertion target: a fake "workflow agent" that, faced with an
 * irreversible decision, calls `contact_supervisor` instead of guessing — exactly the
 * PASS criterion of the intercom escalation scenario, but with a deterministic stand-in so we can lock
 * the assertion shape before wiring a live Pi agent.
 */

/** The tools the harness wraps and injects as `runtime.tools`. Names here are the names
 *  that show up in `toolCalls(result)` — this is the seam we assert against. */
const tools = {
  contact_supervisor: {
    description: "Escalate an ambiguous/irreversible decision back to the supervisor.",
    execute: async (args: { question: string }) =>
      ({ acknowledged: true, question: args.question }),
  },
  write_file: {
    description: "Write source to disk (the anti-pattern if used before escalating).",
    execute: async (args: { path: string }) => ({ written: args.path }),
  },
};

/** Minimal agent in the shape `piAiHarness` expects: `run(input, runtime)`.
 *  Real Pi SDK agents expose the same entrypoint; here we hand-script the decision so the
 *  test is deterministic. */
function createFakeWorkflowAgent() {
  return {
    async run(input: string, runtime: { tools: harnessTools }) {
      // Simulate the correct behavior: detect the irreversible fork, escalate, stop.
      if (/translit|unicode|russian|greek|привет/i.test(input)) {
        await runtime.tools.contact_supervisor({
          question:
            "Transliterate Russian/Greek to ASCII, or preserve Unicode letters in slugs?",
        });
        return { output: "Escalated to supervisor; awaiting decision before coding." };
      }
      return { output: "No irreversible decision detected." };
    },
  };
}

// Type alias so the agent's runtime param matches what the harness injects.
type harnessTools = {
  [K in keyof typeof tools]: (args: Parameters<(typeof tools)[K]["execute"]>[0]) => Promise<unknown>;
};

const harness = piAiHarness({
  agent: () => createFakeWorkflowAgent(),
  tools,
});

describeEval("harness smoke — escalation captured deterministically", { harness }, (it) => {
  it("captures contact_supervisor and does NOT write before escalating", async ({ run }) => {
    const result = await run(
      'Extend slugify to support Russian and Greek (slugify("Привет мир") returns "").',
    );

    const names = toolCalls(result).map((c) => c.name);

    // PASS criterion: it escalated.
    expect(names).toContain("contact_supervisor");
    // Anti-pattern guard: it did NOT silently write source first.
    expect(names).not.toContain("write_file");
    // The agent must stop and report the escalation rather than pretend to have finished.
    expect(result.output).toMatch(/escalated/i);
  });

  it("does not escalate on a trivial prompt (no false trigger)", async ({ run }) => {
    const result = await run("Rename the variable x to count.");
    expect(toolCalls(result).map((c) => c.name)).not.toContain("contact_supervisor");
  });
});
