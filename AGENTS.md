# Project Instructions

## Project structure
```
src/                 Source modules, each paired with a *.test.js (vitest)
  discount.js        Discount calculation (the pipeline's end-to-end test task)
  math.js            Math helpers
  slugify.js         Slug generation
  tg-bridge/         Telegram↔CLI dual-reply bridge logic (ask-state, config, detect, telegram)
extensions/          tg-bridge.js — pi extension runtime shim for the bridge
.pi/extensions/      permission-gate.js — deterministic tool-call safety gate
.pi/agents/          Project agents: linter-checker, comment-checker
evals/               vitest-evals suites + minimal pi-ai agent harness
docs/                Design specs, plans, research notes
workflow.md          The agentic subagent pipeline (see below)
AGENTS.md            This file — instructions for agents
```
Commands: `pnpm test` (vitest), `pnpm lint` (eslint), `pnpm typecheck` (tsc),
`pnpm check` (lint + types), `pnpm evals`.

## Workflow for any non-trivial task
The full subagent pipeline (researcher → oracle → reviewer → worker → reviewer ×3 →
linter-checker + comment-checker), per-role models, and run commands live in
[workflow.md](./workflow.md). Follow it for any non-trivial task.

Escalation: if any agent hits a blocker, an ambiguous requirement, or an irreversible
product decision, use `contact_supervisor` (intercom) to ask me instead of guessing.

## Quality gates
- Run `pnpm check` (lint + types) after code changes.
- Run the test suite before declaring a task done; report PASS/FAIL with details.
- Keep responses concise.

## Git safety — hard rule, no exceptions
- Agents and sub-agents MUST NEVER run `git commit`, `git push`, `git tag`,
  force-push, rebase on remote branches, or `reset --hard` on tracked branches.
- If a task requires committing or pushing, STOP and ask me instead of proceeding.
- This applies universally, including in any sandbox or worktree mode.
