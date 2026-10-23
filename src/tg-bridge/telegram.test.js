import { describe, it, expect, vi } from "vitest";
import { sendTelegramMessage, fetchReplyOnce, getLatestOffset } from "./telegram.js";

/**
 * Build a `fetch`-shaped mock returning a minimal Response-like object — only the
 * fields the bridge reads (`ok`, `status`, `json`, `text`). The inner object is
 * cast to `Response` so `checkJs` accepts the partial shape while the returned
 * `vi.fn` keeps its Mock type (so `.mock.calls` stays typed in the tests).
 */
function mockFetch(payload, ok = true, status = 200) {
  return vi.fn(async () => /** @type {Response} */ ({
    ok,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  }));
}

describe("sendTelegramMessage", () => {
  it("POSTs to sendMessage with chat_id and text", async () => {
    const fetchImpl = mockFetch({ ok: true });
    await sendTelegramMessage({ botToken: "T", chatId: "C", text: "hi", fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = /** @type {[string, RequestInit]} */ (/** @type {unknown} */ (fetchImpl.mock.calls[0]));
    expect(url).toContain("/botT/sendMessage");
    const body = JSON.parse(/** @type {string} */ (init.body));
    expect(body.chat_id).toBe("C");
    expect(body.text).toBe("hi");
  });

  it("throws on non-ok response", async () => {
    const fetchImpl = mockFetch({ description: "bad" }, false, 400);
    await expect(sendTelegramMessage({ botToken: "T", chatId: "C", text: "hi", fetchImpl }))
      .rejects.toThrow(/400/);
  });
});

describe("fetchReplyOnce", () => {
  it("returns the first text message from the target chat", async () => {
    const payload = { ok: true, result: [
      { update_id: 10, message: { chat: { id: 999 }, text: "ignore other chat" } },
      { update_id: 11, message: { chat: { id: 555 }, text: "the answer" } },
    ] };
    const fetchImpl = mockFetch(payload);
    const r = await fetchReplyOnce({ botToken: "T", chatId: "555", offset: 0, fetchImpl });
    expect(r).toEqual({ text: "the answer", updateId: 11 });
  });

  it("passes offset to getUpdates", async () => {
    const fetchImpl = mockFetch({ ok: true, result: [] });
    await fetchReplyOnce({ botToken: "T", chatId: "555", offset: 42, fetchImpl });
    const [url] = /** @type {[string]} */ (/** @type {unknown} */ (fetchImpl.mock.calls[0]));
    expect(url).toContain("offset=42");
  });

  it("returns null when no message matches", async () => {
    const payload = { ok: true, result: [
      { update_id: 5, message: { chat: { id: 999 }, text: "nope" } },
      { update_id: 6, edited_message: { chat: { id: 555 }, text: "edited, ignore" } },
    ] };
    const fetchImpl = mockFetch(payload);
    const r = await fetchReplyOnce({ botToken: "T", chatId: "555", offset: 0, fetchImpl });
    expect(r).toBeNull();
  });

  it("ignores empty-text messages", async () => {
    const payload = { ok: true, result: [
      { update_id: 7, message: { chat: { id: 555 }, text: "" } },
    ] };
    const fetchImpl = mockFetch(payload);
    const r = await fetchReplyOnce({ botToken: "T", chatId: "555", offset: 0, fetchImpl });
    expect(r).toBeNull();
  });
});

describe("getLatestOffset", () => {
  it("returns 0 when there are no pending updates", async () => {
    const fetchImpl = mockFetch({ ok: true, result: [] });
    const offset = await getLatestOffset({ botToken: "T", fetchImpl });
    expect(offset).toBe(0);
  });

  it("returns max update_id + 1 when updates are present", async () => {
    const payload = { ok: true, result: [
      { update_id: 5 },
      { update_id: 12 },
      { update_id: 8 },
    ] };
    const fetchImpl = mockFetch(payload);
    const offset = await getLatestOffset({ botToken: "T", fetchImpl });
    expect(offset).toBe(13);
  });
});
