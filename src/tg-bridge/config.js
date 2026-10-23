import { readFileSync as fsReadFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Default location of notify's config — the single source of truth for Telegram
 * credentials. Reused deliberately so the user configures Telegram once via
 * `/unipi:notify-set-tg` and the bridge never owns a second copy of the token.
 */
const DEFAULT_CONFIG_PATH = join(homedir(), ".unipi", "config", "notify", "config.json");

/**
 * Load and validate Telegram credentials for the bridge.
 *
 * Never throws: any failure (missing file, bad JSON, channel disabled, missing
 * fields) returns `{ enabled: false, disabledReason }` so the bridge can
 * self-disable and leave the CLI reply path completely intact. `configPath` and
 * `readFileSync` are injectable for tests.
 */
export function loadTelegramConfig({ configPath = DEFAULT_CONFIG_PATH, readFileSync = fsReadFileSync } = {}) {
  let raw;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch (err) {
    return { enabled: false, disabledReason: `notify config not found at ${configPath} (${err.code ?? "read error"})` };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { enabled: false, disabledReason: `could not parse notify config (invalid JSON) at ${configPath}` };
  }

  const tg = parsed?.telegram;
  if (!tg || tg.enabled !== true) {
    return { enabled: false, disabledReason: "telegram channel is not enabled in notify config" };
  }
  if (!tg.botToken) {
    return { enabled: false, disabledReason: "telegram botToken missing in notify config" };
  }
  if (!tg.chatId) {
    return { enabled: false, disabledReason: "telegram chatId missing in notify config" };
  }
  return { enabled: true, botToken: String(tg.botToken), chatId: String(tg.chatId) };
}
