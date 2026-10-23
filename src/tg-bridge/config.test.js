import { describe, it, expect } from "vitest";
import { loadTelegramConfig } from "./config.js";

const fakeRead = (json) => () => json;

describe("loadTelegramConfig", () => {
  it("returns enabled config when telegram is fully configured", () => {
    const json = JSON.stringify({ telegram: { enabled: true, botToken: "T", chatId: "C" } });
    const cfg = loadTelegramConfig({ configPath: "/x", readFileSync: fakeRead(json) });
    expect(cfg).toEqual({ enabled: true, botToken: "T", chatId: "C" });
  });

  it("disables when telegram.enabled is false", () => {
    const json = JSON.stringify({ telegram: { enabled: false, botToken: "T", chatId: "C" } });
    const cfg = loadTelegramConfig({ configPath: "/x", readFileSync: fakeRead(json) });
    expect(cfg.enabled).toBe(false);
    expect(cfg.disabledReason).toMatch(/not enabled/i);
  });

  it("disables when botToken or chatId missing", () => {
    const json = JSON.stringify({ telegram: { enabled: true, botToken: "T" } });
    const cfg = loadTelegramConfig({ configPath: "/x", readFileSync: fakeRead(json) });
    expect(cfg.enabled).toBe(false);
    expect(cfg.disabledReason).toMatch(/chatId/i);
  });

  it("disables when botToken is missing but chatId present", () => {
    const json = JSON.stringify({ telegram: { enabled: true, chatId: "C" } });
    const cfg = loadTelegramConfig({ configPath: "/x", readFileSync: fakeRead(json) });
    expect(cfg.enabled).toBe(false);
    expect(cfg.disabledReason).toMatch(/botToken/i);
  });

  it("disables when file is missing", () => {
    const throwRead = () => { const e = /** @type {Error & { code?: string }} */ (new Error("ENOENT")); e.code = "ENOENT"; throw e; };
    const cfg = loadTelegramConfig({ configPath: "/missing", readFileSync: throwRead });
    expect(cfg.enabled).toBe(false);
    expect(cfg.disabledReason).toMatch(/not found|missing|ENOENT/i);
  });

  it("disables when JSON is malformed", () => {
    const cfg = loadTelegramConfig({ configPath: "/x", readFileSync: fakeRead("{ broken") });
    expect(cfg.enabled).toBe(false);
    expect(cfg.disabledReason).toMatch(/parse|invalid/i);
  });
});
