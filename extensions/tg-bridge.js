// extensions/tg-bridge.js — symlink this file into ~/.pi/agent/extensions/
import { loadTelegramConfig } from "../src/tg-bridge/config.js";
import { sendTelegramMessage, fetchReplyOnce, getLatestOffset } from "../src/tg-bridge/telegram.js";
import { createAskState } from "../src/tg-bridge/ask-state.js";
import { extractPendingAsk } from "../src/tg-bridge/detect.js";

// Short enough that a phone reply feels immediate, long enough to stay far below
// Telegram's getUpdates rate limits over a 10-minute window.
const POLL_INTERVAL_MS = 2000;
// Matches intercom's child-side 10-min wait. If neither human answers within
// this window, we close the slot so future escalations are not silently dropped
// and the poll loop does not run for the entire session.
const ASK_TTL_MS = 10 * 60 * 1000;

/**
 * Dual-reply bridge: forwards pi-intercom `contact_supervisor` questions to
 * Telegram and injects the reply back, so a supervisor can answer from EITHER
 * Telegram or the pi CLI (first answer wins). All real logic is unit-tested in
 * src/tg-bridge/; this file only wires it to pi events, so keep logic out of it.
 */
export default function tgBridge(pi) {
  const state = createAskState();
  let cfg = { enabled: false };
  let aborter = null;
  let ttlTimer = null;

  function stopPolling() {
    if (aborter) { aborter.abort(); aborter = null; }
  }

  function clearTtl() {
    if (ttlTimer) { clearTimeout(ttlTimer); ttlTimer = null; }
  }

  pi.on("session_start", async (_event, ctx) => {
    cfg = loadTelegramConfig();
    if (!cfg.enabled) {
      ctx?.ui?.notify?.(`[tg-bridge] disabled: ${cfg.disabledReason}`, "info");
    }
  });

  // Detection path: agent_end carries the full message history including the
  // intercom_message frames emitted by contact_supervisor (confirmed on a live run).
  // If a future pi version stops including them, switch detection to
  // pi.on("tool_execution_end", ...) and call state.open() with the child's text.
  pi.on("agent_end", async (event, ctx) => {
    if (!cfg.enabled) return;
    const ask = extractPendingAsk(event.messages);
    if (!ask) return;
    if (!state.open(ask.id, ask.text)) return; // one already pending, or same id already handled

    // Baseline the offset at push time so stale buffered messages in Telegram's
    // update queue are not injected as replies.
    let offset = 0;
    try {
      offset = await getLatestOffset({ botToken: cfg.botToken });
    } catch {
      // network failure — start from 0; mild risk of stale replay, acceptable
    }

    try {
      await sendTelegramMessage({ botToken: cfg.botToken, chatId: cfg.chatId, text: ask.text });
    } catch (err) {
      ctx?.ui?.notify?.(`[tg-bridge] telegram send failed, CLI reply still works: ${err.message}`, "warning");
      // keep the ask open so the CLI path can still answer it
    }

    // Arm a TTL so the slot does not stay open forever when neither human answers. `state.close()` records lastHandledId (see ask-state.js) so
    // the expired question is not immediately re-armed on the next agent_end.
    clearTtl();
    ttlTimer = setTimeout(() => {
      state.close();
      stopPolling();
    }, ASK_TTL_MS);

    stopPolling();
    aborter = new AbortController();
    const signal = aborter.signal;
    (async function poll() {
      while (state.isOpen() && !signal.aborted) {
        try {
          const reply = await fetchReplyOnce({ botToken: cfg.botToken, chatId: cfg.chatId, offset, fetchImpl: fetch, signal });
          if (reply) {
            offset = reply.updateId + 1;
            if (state.tryAnswer()) {
              clearTtl();
              pi.sendUserMessage(reply.text);
              stopPolling();
              return;
            }
          }
        } catch {
          // network blip or abort — loop guard handles exit
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
    })();
  });

  pi.on("tool_call", (event) => {
    if (!state.isOpen()) return;
    const isReply = event.toolName === "intercom" && event.input?.action === "reply";
    if (!isReply) return;
    if (state.tryAnswer()) {
      clearTtl();
      stopPolling();
    }
  });

  pi.on("session_shutdown", async () => {
    clearTtl();
    stopPolling();
    state.close();
  });
}
