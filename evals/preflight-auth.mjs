/**
 * Auth preflight for the live escalation eval. Run before `RUN_LIVE_EVALS=1 pnpm evals` to
 * confirm the pi-ai SDK can actually reach a model — it surfaces the auth requirement that
 * the eval otherwise hits at runtime.
 *
 * Key fact (discovered during the bridge spike): `completeSimple` authenticates from an
 * API-key ENV VAR (ANTHROPIC_API_KEY, OPENAI_API_KEY, …) or an explicit apiKey — it does
 * NOT read the pi CLI's OAuth ~/.pi/agent/auth.json. The `openai-codex` provider is OAuth
 * only, so the raw SDK cannot use a Codex login; pick an API-key provider for live evals.
 *
 *   PI_EVAL_PROVIDER=anthropic PI_EVAL_MODEL=claude-sonnet-4-5 \
 *   PI_EVAL_API_KEY=$ANTHROPIC_API_KEY node evals/preflight-auth.mjs
 */
import { completeSimple, getModel } from "@mariozechner/pi-ai";

const provider = /** @type {import("@mariozechner/pi-ai").KnownProvider} */ (process.env.PI_EVAL_PROVIDER ?? "anthropic");
const modelId = process.env.PI_EVAL_MODEL ?? "claude-sonnet-4-5";
const apiKey = process.env.PI_EVAL_API_KEY;

const model = getModel(provider, /** @type {never} */ (modelId));
console.log(`model: ${model.provider}/${model.id} (api=${model.api})`);

const msg = await completeSimple(
  model,
  {
    systemPrompt: "You are a helpful assistant.",
    messages: [{ role: "user", content: "Reply with the single word: ping", timestamp: Date.now() }],
  },
  { apiKey },
);

if (msg.stopReason === "error" || msg.stopReason === "aborted") {
  console.error(`❌ auth/transport failed: ${msg.errorMessage ?? "unknown"}`);
  process.exit(1);
}
console.log("✅ reachable. reply:", JSON.stringify(msg.content));
