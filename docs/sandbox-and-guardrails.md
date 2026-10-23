# Sandbox and guardrails: why the permission gate exists

Verified live against pi docs in June 2026. Several points differ from what the pi
docs skeleton suggested; they are marked.

## The problem

`AGENTS.md` tells agents never to run `git commit`, `git push`, `rm -rf` and so on. A
model "creatively interprets" text rules, and pi has no built-in sandbox. For autonomous
runs you need two layers: a regex gate that cannot be talked out of it, and a
disposable container so the autonomous loop never touches a host that holds real
credentials.

## Layer 1: the permission gate (`.pi/extensions/permission-gate.js`)

A `tool_call` hook. Before any tool executes, the handler inspects the call and may return
`{ block: true, reason }`; `reason` goes back to the model as the refusal explanation.
It applies to the main session **and** every sub-agent session, which is the whole point.

Gotchas that cost real time:

| Topic | What you might expect | What is actually true |
|---|---|---|
| Tool params in `tool_call` | `event.params.command` | `event.input.command`. With the wrong key the regex runs against `undefined` and the gate silently passes everything. |
| Project-local extension path | unspecified | `.pi/extensions/` in the **real** project root. pi walks up the tree for config, so a wrong level loads it for the wrong directory or not at all. |
| Loading in headless mode | automatic | Project-local extensions load **only after trust**. `pi -p` never asks, so without `--approve` the gate is silently skipped. |
| Sandbox | assumed built in | pi has **no** sandbox. The container is the sandbox. |

## Testing the gate, not the prompt

Belt vs braces. If the model refuses `git commit` "because of AGENTS.md", the **text**
worked and bash was never called. That tells you nothing about the gate.

To test the gate itself, ask for a command that is **not** in `AGENTS.md` but is caught by
the gate, so the model has no reason to refuse and actually calls the tool:

```bash
mkdir -p /tmp/pi-gate-test && touch /tmp/pi-gate-test/canary.txt
# in pi:  Run exactly this and show raw output: rm -rf /tmp/pi-gate-test
ls /tmp/pi-gate-test
```

Canary still there plus a refusal quoting your `reason` (`Blocked by safety policy (rm -rf)`):
the gate works. Folder gone: the gate is not active (project not trusted, wrong root, no
`/reload`). A refusal that cites AGENTS.md instead of your literal reason means the model
policed itself, which is not something to rely on in autonomous mode.

## Layer 2: a disposable container (Apple Silicon)

Only the project and the model token go inside. Nothing else from `$HOME`.

```dockerfile
# Dockerfile.pi — disposable sandbox for high-autonomy pi runs
FROM node:22-slim
RUN npm install -g @mariozechner/pi-coding-agent
# Workflow packages live in the GLOBAL npm dir (~/.pi/agent/npm), not the project,
# so they must be baked in or there are no sub-agents and no contact_supervisor inside.
RUN pi install npm:pi-subagents
WORKDIR /work
```

```bash
docker build -f Dockerfile.pi -t pi-sandbox .
docker run --rm -it \
  -v "$PWD":/work \
  -v ~/.pi/agent/auth.json:/root/.pi/agent/auth.json \
  --memory=4g --cpus=2 \
  --name pi-sandbox \
  pi-sandbox bash
```

`--rm` makes it disposable (edits under `/work` persist, it is a bind mount). The memory
and CPU caps stop a looping agent from eating the laptop. Inside, run headless **with
`--approve`**, otherwise the gate is not loaded:

```bash
pi -p --approve "Run the AGENTS.md workflow for <task>. Plan, let oracle review, implement, run reviewers + tests. Stop and ask via intercom if blocked."
```
