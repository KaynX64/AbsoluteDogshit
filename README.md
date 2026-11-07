# AGENTS.md Pack — Valetudo HealthLink

Four instruction files for AI coding agents (Codex, Claude Code, Cursor, Gemini CLI, etc. all read `AGENTS.md` natively), written to **minimize token spend**: every file is a routing map + verified facts + "don't read this" guards, so agents stop exploring and start editing.

## Contents

| File | Goes to | What it carries |
|---|---|---|
| `AGENTS.md` | repo root | monorepo map, ports, bootstrap order, command cheat sheet, cross-module contract (build-time API URL, CORS, `PUBLIC_API_BASE_URL`), security invariants, token-efficiency rules |
| `server/AGENTS.md` | `server/` | boot pipeline, route table, middleware, auth model, utils one-liners, 29-table schema map, env manifest, tests |
| `desktop/AGENTS.md` | `desktop/` | Electron process model, certificate policy, the #1 build-time `apiBaseUrl` gotcha, renderer map, commands |
| `mobile/AGENTS.md` | `mobile/` | API-host hardcode point, code map, which generated files are editable, Firebase setup, gotchas |

## Install

Copy the files into the repo preserving the paths, then commit:

```
AGENTS.md          →  <repo>/AGENTS.md
server/AGENTS.md   →  <repo>/server/AGENTS.md
desktop/AGENTS.md  →  <repo>/desktop/AGENTS.md
mobile/AGENTS.md   →  <repo>/mobile/AGENTS.md

git add AGENTS.md server/AGENTS.md desktop/AGENTS.md mobile/AGENTS.md
git commit -m "docs: add AGENTS.md guides for AI agents (token-optimized)"
```

## Why only 4 files — and why that is the token-optimal design

- Agents auto-load the root `AGENTS.md` at session start, and a nested `AGENTS.md` the moment they work inside that subtree. Every extra file you add is re-read on each access in its tree — more files means MORE tokens, not fewer.
- `server/`, `desktop/`, `mobile/` are the only decision-dense trees. Generated/vendor trees (`node_modules`, `dist`, `release`, lockfiles, Flutter platform dirs) must not carry instructions.
- The root file carries only cross-module facts; per-module detail lives beside the code it describes, so an agent editing `desktop/` never pays for server details.

## What they actually optimize

1. **Routing tables replace exploration** — "endpoint behavior ⇒ `server/src/routes/<name>.js`", so agents skip glob/grepping.
2. **Hard blocks on the biggest token sinks** — `DoctorConsole.tsx` (~154 KB ≈ 40 K tokens), `AdminConsole.tsx` (~124 KB), `patient_portal_screen.dart` (~115 KB), all lockfiles, all generated dirs.
3. **One-line warnings for the expensive mistakes** — the build-time `apiBaseUrl` trap, the CORS allow-list, TLS bootstrap, SAN requirements, the `10.0.2.2` emulator rule, cert-install requirement on Android.
4. **Verified commands and infra facts** — ports, docker-compose credentials mapping, `.env` variable groups, test invocations — no re-derivation needed.

## Keeping them true (important)

When the code changes, update the matching file — a stale `AGENTS.md` costs tokens *and* trust:

- ports / certs / infra → root `AGENTS.md`
- new or renamed route/util → `server/AGENTS.md` tables
- new component or main-process behavior → `desktop/AGENTS.md`
- new screen/service → `mobile/AGENTS.md`
