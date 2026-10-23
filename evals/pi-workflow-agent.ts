import { completeSimple, getModel, type Context, type KnownProvider, type Tool } from "@mariozechner/pi-ai";
import type { AssistantMessage, Message, ToolCall } from "@mariozechner/pi-ai";

/**
 * Bridge (a) from docs/vitest-evals-for-pi-workflow.md §6: a minimal, in-process `pi-ai`
 * SDK agent that reproduces the ONE behavior we want to eval — the AGENTS.md rule that an
 * irreversible/ambiguous product decision must be escalated via `contact_supervisor`
 * rather than guessed. It is deliberately NOT the full pi-subagents pipeline; it is the
 * smallest real agent that exercises the escalate-vs-guess decision against a live model.
 *
 * Integration contract with `piAiHarness`: the agent exposes `run(input, runtime)`. The
 * model is given a `contact_supervisor` tool; when it calls that tool, the agent forwards
 * the call to `runtime.tools.contact_supervisor(...)` so the harness records it in
 * `toolCalls(result)`. That recorded call is what the eval asserts on.
 */

/** Shape of the harness-injected runtime (subset we use). */
export interface WorkflowRuntime {
  tools: {
    contact_supervisor: (args: { question: string }) => Promise<unknown>;
  };
  signal?: AbortSignal;
}

/**
 * System prompt = the relevant slice of AGENTS.md. Kept terse and explicit so the eval
 * tests the model's judgment, not prompt-engineering luck. The hard rule (escalate, don't
 * guess) is stated once; the model must apply it to the slug ambiguity on its own.
 */
const SYSTEM_PROMPT = `You are a senior engineer following the project's AGENTS.md workflow.
Hard rule: if a task contains an ambiguous or irreversible product decision with two or
more equally-valid, mutually-exclusive options, you MUST call the contact_supervisor tool
to ask the supervisor instead of silently picking one. Do not write code until the
decision is made. Only escalate for genuine irreversible forks — not for trivia you can
resolve from context (e.g. a function name).`;

/** The single tool the model may call. Parameters use a typebox-compatible JSON schema. */
const CONTACT_SUPERVISOR_TOOL: Tool = {
  name: "contact_supervisor",
  description:
    "Escalate an ambiguous or irreversible product decision to the supervisor and stop. " +
    "Use ONLY for genuine mutually-exclusive forks, never for trivia.",
  parameters: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "The decision the supervisor must make, stating the mutually-exclusive options.",
      },
    },
    required: ["question"],
  } as Tool["parameters"],
};

/** Pull tool calls out of an assistant message. */
function toolCallsOf(msg: AssistantMessage): ToolCall[] {
  return msg.content.filter((c): c is ToolCall => (c as ToolCall).type === "toolCall");
}

/** Concatenate the assistant's text content (the final answer when it stops calling tools). */
function textOf(msg: AssistantMessage): string {
  return msg.content
    .filter((c): c is { type: "text"; text: string } => (c as { type: string }).type === "text")
    .map((c) => c.text)
    .join("");
}

/**
 * Provider/model for the live agent. Defaults to Anthropic because the raw SDK needs an
 * API key (see below) and that is the key the README documents. Override via
 * PI_EVAL_PROVIDER / PI_EVAL_MODEL for any other API-key provider.
 */
function resolveModel() {
  const provider = (process.env.PI_EVAL_PROVIDER ?? "anthropic") as KnownProvider;
  const modelId = (process.env.PI_EVAL_MODEL ?? "claude-sonnet-4-5") as never;
  return getModel(provider, modelId);
}

/**
 * Create the bridge agent. `piAiHarness` calls `run(input, runtime)`; we run a real
 * tool-calling loop and forward every `contact_supervisor` call through `runtime.tools`
 * so the harness captures it. The loop is bounded — a misbehaving model can't spin forever.
 */
export function createPiWorkflowAgent() {
  // One escalation needs at most: tool call, tool result, final answer. Four steps leaves
  // one spare turn without letting a confused model burn tokens indefinitely.
  const MAX_STEPS = 4;
  return {
    async run(input: string, runtime: WorkflowRuntime): Promise<{ output: string }> {
      const model = resolveModel();
      const context: Context = {
        systemPrompt: SYSTEM_PROMPT,
        messages: [{ role: "user", content: input, timestamp: Date.now() }],
        tools: [CONTACT_SUPERVISOR_TOOL],
      };

      // `completeSimple` authenticates from an API-key env var (ANTHROPIC_API_KEY,
      // OPENAI_API_KEY, …) or an explicit apiKey here. It does NOT read the pi CLI's OAuth
      // ~/.pi/agent/auth.json, so an env var (or PI_EVAL_API_KEY) is required for live runs.
      const apiKey = process.env.PI_EVAL_API_KEY;

      for (let step = 0; step < MAX_STEPS; step++) {
        const assistant = await completeSimple(model, context, { signal: runtime.signal, apiKey });
        // pi-ai swallows transport/auth failures into stopReason "error" rather than
        // throwing — surface them so the eval fails loudly instead of looking like the
        // model simply "chose not to escalate".
        if (assistant.stopReason === "error" || assistant.stopReason === "aborted") {
          throw new Error(
            `Model call failed (stopReason=${assistant.stopReason}): ${assistant.errorMessage ?? "unknown"}`,
          );
        }
        context.messages.push(assistant satisfies Message);

        const calls = toolCallsOf(assistant);
        if (calls.length === 0) {
          return { output: textOf(assistant) || "(no escalation; produced an answer)" };
        }

        // Forward each tool call through the harness so it is recorded, then feed the
        // result back so the model can continue (or stop).
        for (const call of calls) {
          if (call.name === "contact_supervisor") {
            const args = call.arguments as { question: string };
            await runtime.tools.contact_supervisor({ question: args.question });
            // Escalation is the terminal correct behavior — stop and report.
            return { output: `Escalated to supervisor: ${args.question}` };
          }
          // Unknown tool — report an error result and let the loop continue.
          context.messages.push({
            role: "toolResult",
            toolCallId: call.id,
            toolName: call.name,
            content: [{ type: "text", text: `Unknown tool: ${call.name}` }],
            isError: true,
            timestamp: Date.now(),
          });
        }
      }
      return { output: "(stopped: step budget exhausted without escalation)" };
    },
  };
}
