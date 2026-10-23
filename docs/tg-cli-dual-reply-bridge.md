# Telegram ↔ CLI dual-reply bridge — how it works

A bridge that lets you answer pi sub-agent escalations (`contact_supervisor`) **both from
your phone via Telegram and from the CLI**. Whoever answers first wins.

## The problem

When a sub-agent asks the supervisor a question through `contact_supervisor`
(pi-intercom), the question lands in the parent pi session and waits for a reply. Out of
the box you can only answer **in the CLI** (type into the TUI). This bridge adds a second
road: the same question goes **to Telegram**, the bridge polls Telegram for your reply and
injects it back into the session through `pi.sendUserMessage()`, exactly as if you had
typed it in the CLI. Both roads converge on one point (the agent calls
`intercom({action:"reply"})`), so **the first answer wins** and the second is ignored.

Key fact: the notify package's Telegram integration can only **send** pushes. The return
channel (receiving a reply) had to be built. That is this bridge.

## Architecture: what lives where

```
repo
├── src/tg-bridge/            ← pure logic (unit tests, pnpm test)
│   ├── config.js             ← reads Telegram credentials from the notify config
│   ├── telegram.js           ← Bot API: sendMessage, getUpdates, offset priming
│   ├── ask-state.js          ← state machine: one question at a time + first-wins + dedupe
│   └── detect.js             ← extracts the pending question from agent_end history
└── extensions/tg-bridge.js   ← thin shim: wires the modules to pi events
                                 (symlinked into ~/.pi/agent/extensions/)
```

**Why the split:** pi loads extensions from `~/.pi/agent/extensions/`, outside the
repository. To keep the logic under `pnpm test`, it lives **in the repo** (`src/tg-bridge/`)
and the shim only imports it and attaches it to pi hooks. The shim is deliberately thin:
wiring only, no testable logic.

## Data flow (full cycle)

```
sub-agent ──contact_supervisor──▶ parent pi session
                                        │ intercom emits intercom_message (expectsReply)
                                        │ and triggers an agent turn
                                        ▼
                                  agent_end fires ── tg-bridge catches the question
                      ┌─────────────────┴─────────────────┐
                      ▼ pushToTelegram                    ▼ question also visible in the CLI TUI
                Telegram (phone)                    you type the reply in `pi`
                      │ you reply to the bot              │ agent calls intercom({action:"reply"})
                      ▼                                   │
           pi.sendUserMessage(reply) ─────┐               │
                                          ▼               ▼
                          agent → intercom({action:"reply"}) → sub-agent unblocked
                          (first one wins; the other road is cancelled)
```

## Step by step, what the shim does (`extensions/tg-bridge.js`)

### `session_start` — load config
Calls `loadTelegramConfig()`. If Telegram is not configured (no file, `enabled:false`,
missing token or chatId) the bridge **silently disables itself** and logs
`[tg-bridge] disabled: <reason>` once. The CLI road keeps working.

### `agent_end` — detect, push, start polling
Fires after every agent turn:

1. `extractPendingAsk(event.messages)` finds the **most recent** `intercom_message` whose
   `details.message.expectsReply === true`. None: return.
2. `state.open(id, text)` tries to take the single slot. Returns `false` when the slot is
   already taken (one question at a time) **or** `id` was already handled
   (`lastHandledId`), which prevents re-pushing the same question.
3. **Offset priming:** `getLatestOffset()` reads the current tail of the Telegram update
   queue so polling only sees messages that arrive **after** the question, not old buffer.
4. `sendTelegramMessage()` pushes the question. If the send fails, log a warning and
   **keep the slot open** so the CLI can still answer.
5. Arm a **TTL timer** (`ASK_TTL_MS` = 10 min). If nobody answers in time: `state.close()`
   and stop polling, so the poll loop does not run for the whole session and later
   escalations are not blocked.
6. Start the **poll loop** (`fetchReplyOnce` every `POLL_INTERVAL_MS` = 2 s). On a Telegram
   reply: `state.tryAnswer("telegram")`; if we won the race, clear the TTL, call
   `pi.sendUserMessage(reply.text)` and stop.

### `tool_call` — cancel on CLI reply
If the agent calls `intercom` with `action: "reply"` (you answered in the CLI), call
`state.tryAnswer("cli")`. If we won the race, clear the TTL and **stop polling Telegram**
(a late phone reply is no longer injected).

### `session_shutdown` — cleanup
Clear the TTL, stop polling, free the slot.

## Modules (`src/tg-bridge/`)

### `config.js`
Reads credentials **only** from `~/.unipi/config/notify/config.json`, section `telegram`
(`enabled`, `botToken`, `chatId`). Single source of truth: Telegram is configured once
through `/unipi:notify-set-tg`, the bridge never holds a second copy of the token. The
function **never throws**; any error returns `{ enabled: false, disabledReason }`.

### `telegram.js`
- `sendTelegramMessage({botToken, chatId, text})`: POST to `sendMessage`. No `parse_mode`,
  so the question text needs no escaping. Throws on non-ok HTTP.
- `getLatestOffset({botToken})`: one `getUpdates`, returns `(max update_id) + 1` or `0`.
  Used for priming: skip everything queued before the question.
- `fetchReplyOnce({botToken, chatId, offset})`: one `getUpdates`. Returns the first **new**
  (`update_id >= offset`) text `message` from the right chat, else `null`. Deliberately
  ignores `edited_message`, `callback_query` and empty text.

### `ask-state.js`
Single-slot state machine:
- `open(id, text)`: take the slot; `false` if taken **or** `id === lastHandledId`.
- `isOpen()`, `current()`: status (returns a copy, not the internal object).
- `tryAnswer(source)`: **one-shot**. The first caller after `open` gets `true` (race
  winner), all later callers get `false`. Records `lastHandledId`. This is the guard
  against double injection.
- `close()`: free the slot with no winner (TTL / shutdown); also records `lastHandledId`
  so an expired question does not reopen on the next `agent_end`.

### `detect.js`
Scans history **from the end** (most recent question), recognises an escalation by
`customType === "intercom_message"` + `expectsReply === true`. Takes the text from
`details.bodyText` (fallback: content with the `**📨 From ...**` header stripped).

## Edge cases and how they are covered

| Situation | Behaviour |
|---|---|
| Telegram not configured | Bridge disables itself, CLI works |
| Telegram unreachable on send | Warning, slot stays open, answer from the CLI |
| Nobody answers for 10 min | TTL closes the slot, polling stops, question marked handled |
| Stale junk in the Telegram queue | Offset priming (`getLatestOffset`) skips it |
| Repeated `agent_end` with the same question | `lastHandledId` prevents a second push |
| Race Telegram vs CLI | `tryAnswer` is one-shot: one winner, no double injection |
| Several escalations in a row | One slot at a time; a new `id` opens after the previous closes |

## Usage

1. Configure Telegram once: in `pi` run `/unipi:notify-set-tg` (or write
   `telegram.{enabled,botToken,chatId}` into `~/.unipi/config/notify/config.json`).
2. Link the shim: `ln -s "$PWD/extensions/tg-bridge.js" ~/.pi/agent/extensions/tg-bridge.js`.
3. In `pi` run `/reload` (the bridge reads config on `session_start`).
4. Give a task where a sub-agent escalates via `contact_supervisor`. The question arrives
   in Telegram **and** is visible in the CLI. Answer from either side.

> The bridge reads the token once on `session_start`. After changing config, `/reload`.

## Notes and possible follow-ups

- **Detection via `agent_end`** was confirmed on a live run. The shim keeps a documented
  fallback on `tool_execution_end` / `contact_supervisor` in case a future pi version stops
  carrying `intercom_message` in `agent_end`.
- **Text only.** Telegram inline buttons and structured `interview_request` were left out
  of v1 on purpose (YAGNI). Explicit follow-up.
- **Known small issues (not blockers):** the priming call `getLatestOffset` does not take
  an abort signal (it runs before the aborter exists, negligible impact); the index-based
  fallback id in `detect.js` could in theory collide if live intercom message ids were
  unstable (in practice they are stable).
