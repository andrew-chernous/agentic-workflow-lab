# Agentic Workflow

The pi-subagent pipeline used for any non-trivial task in this repo. AGENTS.md points
here; this file is the single source of truth for the workflow itself.

## The pipeline

Six steps run in sequence, each handing an artifact to the next. `researcher`, `oracle`,
`worker` and `reviewer` are builtin agents from `npm:pi-subagents`. `linter-checker` and
`comment-checker` are project agents defined in [`.pi/agents/`](./.pi/agents/).

| # | Step | Agent | Model | Reads → Writes |
|---|------|-------|-------|----------------|
| 1 | Research (optional) | `researcher` | gpt-5.6-sol, thinking high | task → `research.md` |
| 2 | Plan | `oracle` | gpt-5.6-sol, thinking high | `research.md` → `plan.md` |
| 3 | Review plan | `reviewer` | gpt-5.6-terra | `plan.md` → APPROVE / REVISE |
| 4 | Implement | `worker` | claude-sonnet-5 (default), fresh context, `tdd` skill | `plan.md` → `progress.md` |
| 5 | Review code | `reviewer` ×3 | gpt-5.6-terra | `plan.md`, `progress.md` → findings |
| 6a | Lint gate | `linter-checker` | gemini-3.8-flash | `progress.md` → PASS / FAIL |
| 6b | Comment gate | `comment-checker` | gemini-3.8-flash | `progress.md` → CLEAN / NEEDS WORK |

Model pins for the builtins live in `~/.pi/agent/settings.json` under
`subagents.agentOverrides`; a sanitised copy is in
[`pi-settings.example.json`](./pi-settings.example.json). The two project agents pin
their model in frontmatter.

Model rationale: thinking-heavy roles (research, plan, review) get the strongest
reasoning models with thinking turned up; implementation gets a fast, capable default;
the mechanical gates get the cheapest model because they only run commands and pattern
match. Everything is scoped to one provider via `modelScope` so a sub-agent cannot
silently pick an unapproved model.

## How to run

Each step is a `/run <agent>` invocation inside `pi`. Artifacts pass automatically
through the agents' `output` / `defaultReads` frontmatter, no manual file plumbing.

```text
1. /run researcher        # only when the task needs external/library research
2. /run oracle            # produces plan.md and challenges the approach
3. /run reviewer          # reviews plan.md BEFORE any code
   → revise plan.md until APPROVE / APPROVE WITH CHANGES
4. /run worker            # implements plan.md → progress.md
5. /run reviewer          # run three in parallel: correctness, tests, unnecessary complexity
6. /run linter-checker    # runs `pnpm check` + `pnpm test`
   /run comment-checker   # audits comments/JSDoc against the why-not-what standard
```

Per-run model override when needed: `/run reviewer[model=github-copilot/gpt-5.6-sol]`.

## Rules

1. **Plan before code.** Step 3 gates step 4. Do not implement an unreviewed plan.
2. **Quality gates are blocking.** A task is not done until `pnpm check` passes
   (step 6a) and the comment audit is CLEAN (step 6b).
3. **Escalate, don't guess.** On a blocker, ambiguous requirement, or irreversible
   product decision, use `contact_supervisor` (pi-intercom) instead of guessing.
   The [Telegram bridge](./docs/tg-cli-dual-reply-bridge.md) lets the human answer
   from a phone.
4. **Git safety, hard rule, no exceptions.** Agents and sub-agents MUST NEVER run
   `git commit`, `git push`, `git tag`, force-push, rebase on remote branches, or
   `reset --hard` on tracked branches. If a task requires committing or pushing,
   STOP and ask instead of proceeding. The rule is also enforced mechanically by
   [`.pi/extensions/permission-gate.js`](./.pi/extensions/permission-gate.js).

## Fixing review findings

`comment-checker` and the reviewers only *report*. To apply fixes, hand findings back
to `worker`.
