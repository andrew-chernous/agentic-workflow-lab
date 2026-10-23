/**
 * Single-slot, first-wins state for the one supervisor question that can be
 * pending at a time. Mirrors pi-intercom's own `replyWaiter`, which rejects
 * concurrent waits — so we never need to track more than one. The one-shot
 * `tryAnswer` is the race guard: whichever of the CLI or Telegram paths calls
 * first becomes the winner and every later call no-ops, preventing a double
 * `sendUserMessage` injection.
 *
 * `lastHandledId` prevents re-arming: `extractPendingAsk` always returns the
 * newest escalation frame, which stays in history forever. Without this guard,
 * every subsequent `agent_end` would re-push the same already-answered question.
 */
export function createAskState() {
  let pending = null; // { id, text } | null
  let lastHandledId = null; // id of the most-recently resolved or expired ask

  return {
    /**
     * Opens the slot for a new ask. Returns false if the slot is already occupied
     * (one-at-a-time) OR if `id` matches `lastHandledId` (already answered/expired —
     * dedupe guard against repeated `agent_end` re-scans of the same history frame).
     */
    open(id, text) {
      if (pending) return false;
      if (id === lastHandledId) return false;
      pending = { id, text };
      return true;
    },
    isOpen() {
      return pending !== null;
    },
    current() {
      return pending ? { ...pending } : null;
    },
    /**
     * First caller wins the race. Records `lastHandledId` on success so the same
     * ask cannot be re-armed after it is answered.
     */
    tryAnswer() {
      if (!pending) return false;
      lastHandledId = pending.id;
      pending = null;
      return true;
    },
    /**
     * Clears the slot without picking a winner (TTL expiry or session shutdown).
     * Records `lastHandledId` so an expired ask is not immediately re-armed on
     * the next `agent_end`.
     */
    close() {
      if (pending) lastHandledId = pending.id;
      pending = null;
    },
  };
}
