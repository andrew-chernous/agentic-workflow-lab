# Autonomous LLM Agents — research notes

> Deep-research output (2026-06-20). Question: how to implement an autonomous
> agent (LLM dynamically decides steps/tools, vs. a predefined workflow), and what
> ready-made solutions exist generally + for pi.dev and Claude Code.
>
> Method: 6 search angles, 23 sources, 104 claims extracted, 25 adversarially
> verified (3-vote, need 2/3 to kill). Result: **25/25 confirmed, 0 killed.**
> Vote notation below: `3-0` = unanimous, `2-1` = one dissent.

## TL;DR

- **Workflow vs agent (Anthropic):** workflow = LLM+tools orchestrated through
  *predefined code paths*; **agent** = LLM *dynamically directs its own process and
  tool use* in a loop. Your current `workflow.md` is a workflow, by definition.
- **Implementing an agent is simple:** a `while`-loop alternating LLM calls and tool
  calls over an *augmented LLM* (retrieval + tools + memory). ReAct/reflection/planning
  live *inside* that loop, not against it.
- **Ready-made everywhere:** general frameworks (LangGraph, AutoGen/LangChain, AutoGPT,
  CrewAI, OpenAI Swarm) + Anthropic's official **Claude Agent SDK**. Claude Code has
  native subagents; pi.dev has `pi-subagents` and `pi-interactive-subagents`.
- **Caution:** multi-agent systems often add little over a single agent; 79% of
  failures come from *spec + coordination*, not infrastructure. A deterministic
  gated workflow defends against exactly those failures.

---

## 1. How to implement an autonomous agent

**Definition (Anthropic, verbatim, 3-0):** "Workflows are systems where LLMs and
tools are orchestrated through predefined code paths. Agents... are systems where LLMs
dynamically direct their own processes and tool usage, maintaining control over how
they accomplish tasks."

**Architecture is just a loop (3-0):** "Use simple agentic loops (while-loops wrapping
alternating LLM API and tool calls)." An agent is "an LLM using tools based on
environmental feedback in a loop." The foundational unit is an **augmented LLM** =
LLM + retrieval + tools + memory.

**One iteration — four stages (3-0):**

```
gather context → take action → verify work → repeat
```

Tools (not raw text) are the primary action mechanism — "a contract between
deterministic systems and non-deterministic agents." Each step the agent decides:
call a tool / answer from knowledge / ask a clarifying question.

**ReAct / reflection / planning / memory:** not alternatives to the loop — they live
*inside* it. Adversarial verifiers tried to refute "it's just a loop" via ReAct,
Reflexion, and Lilian Weng's planning/memory framing and failed: those components are
components of the loop, not counter-examples.
*(Caveat: concrete ReAct-inside-Claude implementation is not covered by a surviving
claim — left as an open question.)*

**Minimal build recipe:**

1. Give the LLM a set of tool schemas.
2. Loop: LLM call → if a tool is called, execute it and feed the result back → repeat.
3. Exit when: model stops calling tools / `maxTurns` hit / verify stage says "done".
4. Augment: retrieval (context), memory (state across iterations), a verify step.

---

## 2. Ready-made frameworks (general)

> Weakest-covered area. Existence confirmed; per-framework detail NOT characterized.
> Treat the table below (except Claude Agent SDK) as identification-only.

| Framework | What it is | Status |
|---|---|---|
| **Claude Agent SDK** | Official Anthropic; full agent loop (see below) | Fully covered, 3-0 |
| **LangGraph** | Graph orchestration; supports both deterministic graphs and autonomous mode | Named, not characterized |
| **AutoGen / LangChain** | Runtime agents; invoke LLM every transaction, non-deterministic | Confirmed indirectly, 3-0 |
| **AutoGPT, CrewAI, OpenAI Swarm** | Named in the question | Identification only |

**Claude Agent SDK (3-0, primary):** in Sept 2025 the Claude Code SDK was **renamed to
Claude Agent SDK**. Gives "the same tools, agent loop, and context management that power
Claude Code," in **Python and TypeScript**. Key vs the Client SDK: "With the Client SDK,
you implement a tool loop. With the Agent SDK, Claude handles it."

- Packages: `npm @anthropic-ai/claude-agent-sdk`, `pip claude-agent-sdk`
- Built-in tools (3-0): Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch,
  Monitor, AskUserQuestion, Agent, NotebookEdit (20+) — execution handled by the SDK.

---

## 3. Ready-made for Claude Code and pi.dev

### Claude Code (native, 3-0)

- **Subagents** — defined in **Markdown + YAML frontmatter**. Only `name` and
  `description` required; optional `tools`, `disallowedTools`, `model`, `permissionMode`,
  `mcpServers`, `hooks`, `maxTurns`, `skills`, `memory`, `isolation`. The body = the
  subagent's system prompt.
- **Context isolation** — each subagent runs in its own context window, with its own
  tools and permissions, **does not see the parent's history**; Claude delegates based
  on `description`.
- **Agent tool** — renamed from **`Task` → `Agent` in v2.1.63**; nested subagents added
  in v2.1.172. Main agent delegates subtasks (e.g. backend while main does frontend →
  parallel development).
- Plus **MCP, hooks, slash commands** — all configurable per subagent.

→ For `workflow.md`: the 6 roles = 6 `.md` files in `.pi/agents/` with `model:` in
frontmatter. Maps 1:1 onto the current pi setup.

### pi.dev (3-0)

**Base pi toolkit** (open-source, MIT, `earendil-works/pi`):

- `@earendil-works/pi-ai` — unified multi-provider LLM API (OpenAI/Anthropic/Google)
- `@earendil-works/pi-agent-core` — **agent runtime**: manages `AgentState`, orchestrates
  the turn lifecycle (LLM → parse tool calls → execute). **Autonomy lives here** — the
  LLM dynamically picks tools.
- `@earendil-works/pi-coding-agent` — interactive coding-agent CLI
- `@earendil-works/pi-tui` — terminal UI library

**Ready-made subagent extensions for pi:**

1. **`pi-subagents`** (tintinweb) — Claude Code-style subagents in pi: isolated sessions,
   per-agent tools/system prompt/model/thinking level, mid-run **steering**. Deliberately
   mirrors Claude Code names/conventions (`Agent`, `get_subagent_result`,
   `steer_subagent`) — "feels native." *Likely the basis of the current `workflow.md`.*
2. **`pi-interactive-subagents`** (HazAT, 508★, MIT) — **non-blocking parallel**
   orchestration: subagents in separate terminal panes (cmux/tmux/zellij/WezTerm); main
   agent keeps working. **5 pre-built roles with models**: planner/Opus, scout/Haiku,
   worker/Sonnet, reviewer/Opus, visual-tester/Sonnet.

---

## 4. Counter-argument — before going fully autonomous

**Multi-agent systems often deliver minimal gains over a single agent (3-0).** Cemri et
al., "Why Do Multi-Agent LLM Systems Fail?" (UC Berkeley/Stanford, NeurIPS 2025):
taxonomy **MASFT** = 14 failure modes; **79% of failures** stem from *specification
(41.8%)* and *inter-agent coordination (36.9%)*, not infrastructure. Tran & Kiela (2025):
at equal compute, single agents match/beat multi-agent.

**Implication:** the value of multi-agent comes from *clear role specs and interfaces
between agents*, not from multi-agency itself. The current **deterministic workflow with
explicit gates is a defense**, not a weakness — it guards against the top-2 failure
causes (79%).

A 2026 preprint ("Compiled AI", medium confidence, single-source) frames the contrast:
runtime agent frameworks (AutoGen, LangChain) call the LLM every transaction and are
non-deterministic; precompiled/static workflows use no runtime LLM and are deterministic
(zero-token, ~100% reproducible). Caveat: oversimplified — LangGraph also supports
deterministic graphs.

---

## Caveats

- **General frameworks (LangGraph / AutoGPT / CrewAI / Swarm)** — only existence
  confirmed, no characterization. A dedicated comparison run is needed.
- **ReAct inside the Claude loop** — not covered by a surviving claim.
- **pi facts** rest on first-party READMEs + DeepWiki — fine for "what it is", not for
  performance claims.
- Fast-moving area: versions (v2.1.63 rename, v2.1.172 nested subagents) and the
  Sept 2025 SDK rename will drift.

## Open questions

- Concrete architectural/capability differences between LangGraph, AutoGen, CrewAI,
  AutoGPT, OpenAI Swarm — which fits dynamic LLM-driven (vs graph-orchestrated) autonomy?
- How is ReAct / Reflexion implemented inside the Claude agent loop — emergent or
  engineered scaffolding?
- Given MASFT, under what conditions do Claude Code / pi subagents actually beat a single
  agent (parallelizable subtasks, context isolation, distinct tool scopes)?
- Do pi's subagent extensions share parent context or run fully isolated like Claude Code?

## Sources (primary)

- anthropic.com/research/building-effective-agents
- anthropic.com/engineering/writing-tools-for-agents
- anthropic.com/engineering/building-agents-with-the-claude-agent-sdk
- anthropic.com/news/enabling-claude-code-to-work-more-autonomously
- code.claude.com/docs/en/agent-sdk/overview
- code.claude.com/docs/en/sub-agents
- github.com/earendil-works/pi
- github.com/tintinweb/pi-subagents
- github.com/hazat/pi-interactive-subagents
- arxiv.org/pdf/2503.13657 (MASFT — Why Do Multi-Agent LLM Systems Fail?)
- arxiv.org/pdf/2604.05150 (Compiled AI)
