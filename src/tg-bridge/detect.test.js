import { describe, it, expect } from "vitest";
import { extractPendingAsk } from "./detect.js";

describe("extractPendingAsk", () => {
  it("extracts id and body from an intercom escalation expecting a reply", () => {
    const messages = [
      { role: "assistant", content: "some earlier text" },
      {
        customType: "intercom_message",
        content: "**📨 From worker** (/repo)\n\nShould I use Postgres or SQLite?",
        details: { message: { id: "m-42", expectsReply: true }, bodyText: "Should I use Postgres or SQLite?" },
      },
    ];
    expect(extractPendingAsk(messages)).toEqual({ id: "m-42", text: "Should I use Postgres or SQLite?" });
  });

  it("returns null when the intercom message does not expect a reply", () => {
    const messages = [
      {
        customType: "intercom_message",
        content: "**📨 From worker**\n\nFYI progress update",
        details: { message: { id: "m-7", expectsReply: false }, bodyText: "FYI progress update" },
      },
    ];
    expect(extractPendingAsk(messages)).toBeNull();
  });

  it("returns null when there is no intercom message", () => {
    expect(extractPendingAsk([{ role: "assistant", content: "hi" }])).toBeNull();
  });

  it("picks the newest escalation when several exist", () => {
    const messages = [
      { customType: "intercom_message", details: { message: { id: "old", expectsReply: true }, bodyText: "old q" } },
      { customType: "intercom_message", details: { message: { id: "new", expectsReply: true }, bodyText: "new q" } },
    ];
    expect(extractPendingAsk(messages).id).toBe("new");
  });

  it("falls back to header-stripped content when bodyText is absent", () => {
    const messages = [
      {
        customType: "intercom_message",
        content: "**📨 From worker** (/repo)\n\nbody line one\nbody line two",
        details: { message: { id: "m-1", expectsReply: true } },
      },
    ];
    expect(extractPendingAsk(messages)).toEqual({ id: "m-1", text: "body line one\nbody line two" });
  });

  it("handles empty input", () => {
    expect(extractPendingAsk([])).toBeNull();
    expect(extractPendingAsk(undefined)).toBeNull();
  });
});
