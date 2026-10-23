# Telegram ↔ CLI Dual-Reply Bridge

**Date:** 2026-06-20
**Status:** Approved design, pre-implementation. Historical document: the shim now lives in this repo at `extensions/tg-bridge.js` with relative imports and is symlinked into `~/.pi/agent/extensions/`; the permission gate lives at `.pi/extensions/`.
**Context:** make supervisor escalations answerable from **both** Telegram and the Pi CLI.

## Problem

The original plan described configuring `@pi-unipi/notify` for Telegram. But notify's Telegram
is **send-only** (`platforms/telegram.ts`: `sendTelegramNotification` + `pollForChatId`). It pushes
"blocked / done" to the phone; it has no path to feed a Telegram **reply** back into a waiting agent.

The goal is a **dual flow**: when a subagent escalates via `contact_supervisor` (pi-intercom),
the supervisor can answer **either** in the Pi CLI **or** from Telegram, whichever they reach first.
The CLI path already works out of the box (intercom delivers the question into the parent Pi TUI
and the human types an answer). The **Telegram-reply path must be built**.

## Key architectural realization

The bridge does **not** reach into intercom's private Unix-socket broker. It bridges at the
**session-input layer**:

- When a subagent calls `contact_supervisor`, intercom delivers an `intercom_message`
  (`pi.sendMessage({ customType: "intercom_message", ... })`) to the parent session and triggers a
  turn. The parent agent reads it and is expected to answer via `intercom({ action: "reply", ... })`.
- Whoever supplies that answer produces the **same** agent turn:
  - **CLI path:** human types into the TUI → agent calls `intercom({action:"reply"})`.
  - **Telegram path:** bridge calls `pi.sendUserMessage(<your telegram text>)` → agent calls
    `intercom({action:"reply"})`.
- Both converge on one resolution point. First answer wins; the other is moot.

This was verified against the installed code:
- `ExtensionAPI.sendUserMessage(content, {deliverAs})` injects input exactly as a human would
  (`dist/core/extensions/types.d.ts`).
- intercom registers tools `contact_supervisor` and `intercom` (action `"reply"`) — `index.ts`.
- notify Telegram config lives at `~/.unipi/config/notify/config.json` as
  `telegram: { enabled, botToken, chatId }` — `settings.ts` validation requires `botToken`+`chatId`.
- Pi fires `agent_end` (agent finished, now idle/awaiting input) and `tool_call`/`tool_execution_end`
  hooks — `ExtensionAPI.on(...)`.

## Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Scope | Full dual-flow bridge | The actual "double flow" requested. |
| Detect hook | Watch the intercom question via Pi-native hooks (no intercom patching) | Decoupled from intercom internals; survives version bumps. |
| Code location | Global `~/.pi/agent/extensions/tg-bridge.js` | Sits beside existing `permission-gate.js`; applies to every project. |
| Config source | Reuse notify config (`~/.unipi/config/notify/config.json`) | Single source of truth; configure Telegram once via `/unipi:notify-set-tg`. |

## Components

### 1. Telegram config (reused, not new)
`~/.unipi/config/notify/config.json` → `telegram.botToken`, `telegram.chatId`. Set up via
`/unipi:notify-set-tg`. The bridge reads this file directly. No bridge-specific config file.

### 2. `~/.pi/agent/extensions/tg-bridge.js` — the bridge extension

A single `export default function (pi) { ... }` extension, matching the style of the existing
`permission-gate.js`. Responsibilities, each isolated into a small named function:

- **`loadTelegram()`** — read + validate `botToken`/`chatId` from the notify config. If missing or
  `telegram.enabled !== true`, the bridge self-disables with one startup notice and the CLI path is
  unaffected.
- **Detect a pending supervisor question.** intercom surfaces the escalation as a custom message
  `pi.sendMessage({ customType: "intercom_message", content: "**📨 From <child>** ...", ... })` and
  triggers a turn. The bridge detects it via `agent_end` (agent finished, now awaiting input) by
  scanning the just-ended `messages` for the most recent `intercom_message` whose body indicates a
  pending ask (`message.expectsReply` / the rendered "To reply, use the intercom tool" hint that
  intercom appends only when a reply is expected). The captured text is the child's question body
  (everything after the `**📨 From ...**` header). Capture into a single
  `pendingAsk = { id, text, answered: false }`. The exact match predicate is verified against
  intercom's `sendIncomingMessage` output during implementation; if `agent_end` does not carry the
  custom message, fall back to `tool_execution_end` for `contact_supervisor` on the parent side.
- **`pushToTelegram(text)`** — send the question to Telegram with a short correlation marker so the
  reply can be matched. Reuses notify's Telegram send semantics (plain `sendMessage` Bot API call).
- **`pollForReply(signal)`** — background loop calling `getUpdates` (long-poll/offset), filtering to
  `chatId`, returning the first user reply text after the question was pushed.
- **Inject the reply** — on a Telegram reply, call `pi.sendUserMessage(replyText)`; the agent answers
  intercom and the subagent unblocks.
- **First-wins / cancellation.**
  - One `pendingAsk` at a time (matches intercom's `replyWaiter`, which rejects concurrent waits).
  - If the agent answers via the CLI first — detected by `tool_call`/`tool_execution_end` for the
    `intercom` tool with `action: "reply"` (or the next `agent_end` resolving the ask) — set
    `answered = true`, abort the poll, discard.
  - If Telegram answers first — inject, set `answered = true`, abort the poll.
  - One-shot guard on `answered` prevents double-injection from a race.

### 3. State
In-memory `pendingAsk` only. No persistence. If Pi restarts mid-question, answer in the CLI.
(YAGNI: no DB, no queue, no cross-session state.)

## Data flow

```
subagent ──contact_supervisor──▶ parent Pi ──intercom_message(expectsReply)──▶ agent turn
                                                                                    │
                                                              agent_end (now awaiting input)
                                                                                    │ tg-bridge captures pendingAsk
                          ┌─────────────────────────────────────────────┬─────────┘
                          ▼ pushToTelegram                               ▼ question visible in CLI TUI
                    Telegram (phone)                               you type answer in `pi`
                          │ you reply                                     │
                          ▼ getUpdates poll                               │ agent calls intercom reply
                    sendUserMessage(reply) ──────────────┐               │
                                                         ▼               ▼
                                  agent turn → intercom({action:"reply"}) → subagent unblocks
                                  (first answer wins; other path aborted via `answered` flag)
```

## Error handling

- **Telegram unreachable / send fails** → log warning, keep `pendingAsk` alive; CLI path fully works.
  Never block or break the CLI because of a Telegram failure.
- **No reply within intercom's 10-min window** → intercom rejects the wait itself; bridge clears
  `pendingAsk` on the next `agent_end`/resolution.
- **Malformed / empty Telegram update** → ignore, keep polling.
- **Bot token / chatId missing or `enabled:false`** → bridge disables itself, one startup notice.
- **Race (both reply near-simultaneously)** → `answered` one-shot flag; first write wins, second no-ops.

## Testing

Pure logic is unit-tested with Vitest (already configured: `vitest.config.ts`, `pnpm test`):

1. **`getUpdates` reply correlation** — given mocked `getUpdates` payloads, returns the correct reply
   text for the right `chatId`, ignores other chats / pre-question messages / empty updates.
2. **First-wins state machine** — given (CLI-first) and (Telegram-first) event orders, exactly one
   injection happens and the poll is aborted; `answered` prevents double-injection.
3. **Config loading** — valid config parses; missing `botToken`/`chatId`/`enabled:false` → disabled.

`fetch` is mocked; no live Telegram in tests.

**Manual end-to-end** (acceptance): run the AGENTS.md workflow, force a `contact_supervisor`, verify
(a) push arrives on phone, (b) Telegram reply unblocks the subagent, (c) in a second run, a CLI reply
unblocks it and the bridge stops polling.

## Scope guardrails (YAGNI)

- One pending question at a time.
- Plain-text Telegram reply only — **no** inline buttons / structured `interview_request` support in
  v1 (clear follow-up, not v1).
- No new outbound notify channels; reuse what `/unipi:notify-set-tg` configured.
- No edits to intercom, subagents, or notify packages — bridge is additive.

## Done criteria (observable)

- `~/.pi/agent/extensions/tg-bridge.js` loads on `/reload` with no error (or a clear "disabled:
  telegram not configured" notice when unconfigured).
- Unit tests for the three pure pieces pass under `pnpm test`.
- Manual: a forced `contact_supervisor` is answerable from Telegram **and** from the CLI, first-wins,
  with the unused path cancelled.
- `pnpm check` (lint + types) clean.
- No commits/pushes performed (git-safety rule).
