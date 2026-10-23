/**
 * Strip pi-intercom's rendered header ("**📨 From <name>** (<cwd>) ...") and the
 * blank line that follows it, leaving the child's actual question body. Used only
 * as a fallback when structured `details.bodyText` is unavailable.
 */
function stripIntercomHeader(content) {
  const lines = String(content).split("\n");
  if (lines[0]?.startsWith("**📨 From")) {
    let i = 1;
    while (i < lines.length && lines[i].trim() === "") i++;
    return lines.slice(i).join("\n");
  }
  return String(content);
}

/**
 * Find the newest pending supervisor escalation in an `agent_end` message list.
 *
 * Recognizes pi-intercom's `customType: "intercom_message"` custom message and
 * only treats it as a pending ask when a reply is expected — otherwise routine
 * progress updates would falsely arm the Telegram poll. Returns `{ id, text }`
 * or `null`. Defensive on shape because pi does not type the `agent_end`
 * payload; the shape was confirmed against a live run, not a schema.
 */
export function extractPendingAsk(messages) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.customType !== "intercom_message") continue;
    if (m?.details?.message?.expectsReply !== true) continue;
    const id = m.details.message.id != null ? String(m.details.message.id) : String(i);
    const text = m.details.bodyText != null ? String(m.details.bodyText) : stripIntercomHeader(m.content ?? "");
    return { id, text };
  }
  return null;
}
