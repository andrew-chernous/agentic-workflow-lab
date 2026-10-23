# agentic-workflow-lab

A learning lab for building a **semi-autonomous, multi-agent software-development
pipeline** on top of the open-source [pi](https://github.com/badlogic/pi-mono) coding
agent: six agent roles with per-role model assignment, a hard safety gate that agents
cannot talk their way past, a **human-in-the-loop escalation channel that works from a
phone**, and a **behavioural eval suite** that asserts what the agent *does* rather than
what it says.

This is a personal learning project, not a product. The code in `src/` is deliberately
small: it is the workpiece the pipeline operates on. The interesting parts are the
orchestration, safety, and evaluation layers around it.

## What's inside

**1. Six-role agent pipeline** ([`workflow.md`](./workflow.md))
researcher → oracle (plan) → reviewer (plan review) → worker → reviewer ×3 → lint gate +
comment gate. Thinking-heavy roles get strong reasoning models with thinking turned up;
mechanical gates get the cheapest model. Artifacts (`research.md` → `plan.md` →
`progress.md`) flow through agent frontmatter, no manual plumbing. The two gate agents
are defined in [`.pi/agents/`](./.pi/agents/); model pins are in
[`pi-settings.example.json`](./pi-settings.example.json).

**2. Deterministic permission gate** ([`.pi/extensions/permission-gate.js`](./.pi/extensions/permission-gate.js))
A `tool_call` hook that blocks `git commit/push/tag`, force-push, `reset --hard`, `rebase`,
`rm -rf`, and writes to `.env`, keys, and credential files, for the main session **and**
every sub-agent. A regex cannot be argued with, unlike a prompt rule. Why it exists and
how to test it honestly: [`docs/sandbox-and-guardrails.md`](./docs/sandbox-and-guardrails.md).

**3. Telegram ↔ CLI dual-reply bridge** ([`src/tg-bridge/`](./src/tg-bridge/), [`extensions/tg-bridge.js`](./extensions/tg-bridge.js))
When a sub-agent escalates with `contact_supervisor`, the question is pushed to Telegram
and the reply is injected back into the pi session. The CLI still works. First answer
wins. The logic is a single-slot, first-wins state machine with dedupe, a never-throws
config loader, escalation detection from event history, and a Bot API client with offset
priming. All of it is unit tested; the extension is a thin wiring shim.
Design: [`docs/tg-cli-dual-reply-bridge.md`](./docs/tg-cli-dual-reply-bridge.md).

**4. LLM-behaviour evals** ([`evals/`](./evals/))
A separate `vitest-evals` config with a minimal in-process `pi-ai` agent that exposes one
`contact_supervisor` tool and runs a bounded tool-calling loop. A zero-token smoke eval
uses a scripted fake agent; the live eval asserts that the model **escalates instead of
guessing** on an ambiguous task, by inspecting captured tool calls. Roadmap mapping every
workflow rule to an observable assertion: [`docs/evals-plan-workflow.md`](./docs/evals-plan-workflow.md).

**5. Workpiece** ([`src/`](./src/))
`applyDiscount` (multi-code table, price floor), `slugify` (Unicode-aware), `add`. The
discount feature was run end to end through the pipeline as its acceptance task.

## How the pieces fit

```
                 ┌──────────── pipeline (workflow.md) ────────────┐
   task ──▶ researcher ─▶ oracle ─▶ reviewer ─▶ worker ─▶ reviewer×3 ─▶ gates
                 │                                  │
                 │  every tool call passes          │  blocked? on ambiguity
                 ▼                                  ▼
        permission-gate.js                   contact_supervisor
        (regex, cannot be                           │
         prompted around)                  ┌────────┴────────┐
                                           ▼                 ▼
                                      CLI reply        Telegram reply
                                           └── first wins ──┘
                                                    │
                                             pi.sendUserMessage
```

## Quick start

```bash
pnpm install
pnpm test     # unit tests for the workpiece and the bridge logic
pnpm check    # eslint + tsc
pnpm evals    # smoke evals; the live tier is skipped without an API key
```

To run the live eval against a real model:

```bash
node evals/preflight-auth.mjs                     # confirms the key works with the SDK
PI_EVAL_API_KEY=$ANTHROPIC_API_KEY RUN_LIVE_EVALS=1 pnpm evals
```

To run the pipeline itself you need the pi CLI with `pi-subagents` installed (it ships
`contact_supervisor`). See the next section.

## What lives outside this repo

The pipeline is driven by the pi CLI, so some configuration is in the home directory by
design:

- `~/.pi/agent/settings.json`: per-role model pins (`subagents.agentOverrides`). A
  sanitised copy is [`pi-settings.example.json`](./pi-settings.example.json).
- `~/.pi/agent/extensions/tg-bridge.js`: a symlink to `extensions/tg-bridge.js`.
- `~/.unipi/config/notify/config.json`: Telegram bot token and chat id, written once by
  the `@pi-unipi/notify` package. The bridge reads them from there and never stores a copy.

## Glossary

- **Pipeline**: the ordered sequence of agent runs in `workflow.md`.
- **Role**: one agent in the pipeline (researcher, oracle, reviewer, worker, gate).
- **Artifact**: a markdown file one role writes and the next reads (`plan.md`, `progress.md`).
- **Workpiece**: the small codebase in `src/` the pipeline is exercised on.
- **Gate**: a blocking check. Mechanical gates are the lint and comment agents; the
  permission gate is the `tool_call` hook.
- **Escalation**: a sub-agent asking the human a question via `contact_supervisor`
  instead of guessing.
- **Smoke eval vs live eval**: a smoke eval runs a scripted fake agent with zero tokens;
  a live eval calls a real model and is gated behind an API key.

## What I learned

- Text rules in `AGENTS.md` are a belt. A deterministic hook is the braces. Autonomous
  runs need both, and you must test the hook with a command the prompt does *not* forbid.
- Tested logic belongs in the repo; the extension that pi loads from the home directory
  should be a thin shim. Otherwise the interesting code has no tests.
- Assert behaviour, not wording. "Did the agent call `contact_supervisor`?" is a stable
  assertion. "Did the agent say it was unsure?" is not.
- Cheap models are fine for mechanical gates. Spend the thinking budget on planning and
  review, where the mistakes are expensive.
- Human-in-the-loop only works if the human is actually in the loop. A phone channel
  changed how often I was willing to let a run go unattended.

## Known limitations

- The bridge is text-only: no inline buttons, no structured interviews.
- Model names in `workflow.md` reflect one provider's catalogue at the time of writing.
- The live eval tier covers one rule (escalate, don't guess); the other three in the
  roadmap are not implemented.
- There is no CI. All gates run locally through pi or `pnpm`.

## License

MIT
