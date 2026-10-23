import { describe, it, expect } from "vitest";
import { createAskState } from "./ask-state.js";

describe("createAskState", () => {
  it("opens a pending ask and exposes it", () => {
    const s = createAskState();
    expect(s.open("a1", "pick A or B?")).toBe(true);
    expect(s.isOpen()).toBe(true);
    expect(s.current()).toEqual({ id: "a1", text: "pick A or B?" });
  });

  it("refuses a second concurrent open", () => {
    const s = createAskState();
    s.open("a1", "q1");
    expect(s.open("a2", "q2")).toBe(false);
    expect(s.current().id).toBe("a1");
  });

  it("first answer wins, later answers lose (one-shot)", () => {
    const s = createAskState();
    s.open("a1", "q");
    expect(s.tryAnswer()).toBe(true);
    expect(s.tryAnswer()).toBe(false);
    expect(s.isOpen()).toBe(false);
  });

  it("cli can win the race too", () => {
    const s = createAskState();
    s.open("a1", "q");
    expect(s.tryAnswer()).toBe(true);
    expect(s.tryAnswer()).toBe(false);
  });

  it("can reopen after an answer", () => {
    const s = createAskState();
    s.open("a1", "q1");
    s.tryAnswer();
    expect(s.open("a2", "q2")).toBe(true);
    expect(s.current().id).toBe("a2");
  });

  it("close clears without picking a winner", () => {
    const s = createAskState();
    s.open("a1", "q");
    s.close();
    expect(s.isOpen()).toBe(false);
    expect(s.tryAnswer()).toBe(false);
  });

  it("tryAnswer with nothing open returns false", () => {
    const s = createAskState();
    expect(s.tryAnswer()).toBe(false);
  });

  // Dedupe by id: a repeated agent_end must not re-push an answered question.
  it("refuses to reopen the same id after tryAnswer resolves it", () => {
    const s = createAskState();
    s.open("a1", "q");
    s.tryAnswer();
    // same id must be refused even though slot is free
    expect(s.open("a1", "q")).toBe(false);
  });

  it("allows a different id after the first is answered", () => {
    const s = createAskState();
    s.open("a1", "q1");
    s.tryAnswer();
    expect(s.open("a2", "q2")).toBe(true);
    expect(s.current().id).toBe("a2");
  });

  it("refuses to reopen the same id after close()", () => {
    const s = createAskState();
    s.open("a1", "q");
    s.close();
    expect(s.open("a1", "q")).toBe(false);
  });

  it("allows a different id after close()", () => {
    const s = createAskState();
    s.open("a1", "q1");
    s.close();
    expect(s.open("a2", "q2")).toBe(true);
  });
});
