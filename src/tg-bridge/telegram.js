/**
 * Send a plain-text message via the Telegram Bot API. Text is sent without
 * parse_mode so arbitrary question bodies need no escaping — they render
 * literally, which is what we want for a forwarded supervisor question.
 * Throws on a non-ok HTTP response so the caller can log and keep the CLI path alive.
 */
export async function sendTelegramMessage({ botToken, chatId, text, fetchImpl = fetch }) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "<no body>");
    throw new Error(`Telegram sendMessage failed ${res.status}: ${body}`);
  }
}

/**
 * Fetches the current update queue once (offset=0, limit=100) to determine the
 * highest `update_id` Telegram has seen. Returns `(max update_id) + 1`, which is
 * the correct starting offset so the poll loop only sees messages that arrive AFTER
 * the question was pushed — preventing stale buffered messages from being injected
 * as replies. Returns 0 if there are no pending updates.
 */
// Bot API ceiling for a single getUpdates call; asking for more is silently capped.
const TELEGRAM_GET_UPDATES_MAX_LIMIT = 100;

export async function getLatestOffset({ botToken, fetchImpl = fetch, signal = undefined }) {
  const url = `https://api.telegram.org/bot${botToken}/getUpdates?timeout=0&offset=0&limit=${TELEGRAM_GET_UPDATES_MAX_LIMIT}`;
  const res = await fetchImpl(url, { signal });
  const data = await res.json();
  if (!data?.ok || !Array.isArray(data.result) || data.result.length === 0) return 0;
  return Math.max(...data.result.map((u) => u.update_id)) + 1;
}

/**
 * One getUpdates poll. Returns the first NEW (update_id >= offset) plain-text
 * `message` from the target chat, or null. We deliberately match only `message`
 * (not `edited_message`/`callback_query`) and require non-empty text so a
 * supervisor reply is unambiguous. The caller advances `offset` past the
 * returned updateId to avoid re-reading.
 */
export async function fetchReplyOnce({ botToken, chatId, offset, fetchImpl = fetch, signal = undefined }) {
  const url = `https://api.telegram.org/bot${botToken}/getUpdates?timeout=0&offset=${offset}&allowed_updates=%5B%22message%22%5D`;
  const res = await fetchImpl(url, { signal });
  const data = await res.json();
  if (!data?.ok || !Array.isArray(data.result)) return null;
  for (const update of data.result) {
    if (typeof update.update_id !== "number" || update.update_id < offset) continue;
    const msg = update.message;
    const text = msg?.text;
    if (msg?.chat?.id !== undefined && String(msg.chat.id) === String(chatId) && typeof text === "string" && text.length > 0) {
      return { text, updateId: update.update_id };
    }
  }
  return null;
}
