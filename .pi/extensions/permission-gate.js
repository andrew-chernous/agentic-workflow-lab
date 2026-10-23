// .pi/extensions/permission-gate.js — project-local pi extension.

// Forbidden bash patterns — a regex can't be talked out of it, unlike a prompt.
const FORBIDDEN_BASH = [
  { re: /\bgit\s+commit\b/, why: "git commit" },
  { re: /\bgit\s+push\b/, why: "git push" },
  { re: /\bgit\s+tag\b/, why: "git tag" },
  { re: /\bgit\s+reset\s+--hard\b/, why: "git reset --hard" },
  { re: /\bgit\s+rebase\b/, why: "git rebase (conservative: blocks all)" },
  {
    re: /\bgit\s+push\b.*(--force|--force-with-lease|\s-f\b)/,
    why: "force-push",
  },
  { re: /\brm\s+-[a-z]*r[a-z]*f[a-z]*\b/, why: "rm -rf" }, // -rf, -rfv, ...
  { re: /\brm\s+-[a-z]*f[a-z]*r[a-z]*\b/, why: "rm -fr" }, // -fr, -frv, ...
];

// Paths an agent must never write to / edit.
const PROTECTED_PATHS = [
  /(^|\/)\.env(\..+)?$/, // .env, .env.local, .env.production
  /\.pem$/,
  /\.key$/, // certs / private keys
  /(^|\/)id_(rsa|ed25519)$/, // ssh keys
  /(^|\/)credentials$/, // aws-style credentials file
];

/**
 * Deterministic safety gate for pi: blocks destructive shell commands and writes
 * to secret files before the tool runs. Applies to the main session AND every
 * sub-agent session (oracle / worker / reviewer / ...), which is the whole point:
 * the text rules in AGENTS.md can be rationalised away by a model, a regex cannot.
 * Loaded only after the project is trusted; headless runs need `--approve`.
 */
export default function (pi) {
  pi.on("tool_call", async (event) => {
    // 1. Guard destructive shell commands.
    if (event.toolName === "bash") {
      const cmd = event.input?.command ?? "";
      const hit = FORBIDDEN_BASH.find(({ re }) => re.test(cmd));
      if (hit) {
        return {
          block: true,
          reason: `Blocked by safety policy (${hit.why}). Ask the user instead of proceeding.`,
        };
      }
    }

    // 2. Guard writes/edits to secret files (covers both the write and edit tools).
    if (event.toolName === "write" || event.toolName === "edit") {
      const path = event.input?.path ?? event.input?.file_path ?? "";
      if (PROTECTED_PATHS.some((re) => re.test(path))) {
        return {
          block: true,
          reason: `Blocked by safety policy: writing to a protected secret path (${path}).`,
        };
      }
    }
  });
}
