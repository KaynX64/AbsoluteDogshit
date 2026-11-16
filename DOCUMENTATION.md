# Documentation index

Use this index to find the current guide for a task. Confirm behavior against source and tests; dated reviews describe the code as inspected at that time.

## Architecture and development

- [Codebase overview](CODEBASE-OVERVIEW.md) — system, workflows and architecture.
- [Project agent guidance](AGENTS.md) — cross-module setup, security invariants and documentation rules.
- [Server guidance](server/AGENTS.md) — routes, services, authorization, migrations and tests.
- [Desktop guidance](desktop/AGENTS.md) — Electron, renderer, offline storage and interaction conventions.
- [Mobile guidance](mobile/AGENTS.md) — Flutter architecture, settings and build instructions.

## Setup and source navigation

- [Project README](README.md) — project introduction and split README sections; check dated sections against current source.
- [Desktop README](desktop/README.md) · [Mobile README](mobile/README.md) — module setup and workflows.
- [Server migration rollout](server/MIGRATION-PLAN.md) · [Server policy](server/src/config/SERVER-POLICY.md).
- [Server route map](server/src/routes/AGENTS.md) · [Server utilities](server/src/utils/AGENTS.md).
- [Desktop code-slice index](desktop/docs/CODESLICE.md) · [Mobile code-slice index](mobile/lib/screens/CODESLICE.md).

## Reviews and historical material

- [Codebase review](CODEBASE-REVIEW.md) — dated assessment and checks performed.
- [Server structure review](server/STRUCTURE-REVIEW.md) — past refactor and remaining follow-up.
- `audit.md`, when available locally, is an ignored historical report. Revalidate findings against the current implementation.

Keep documentation near its owner. Update the authoritative split part when its index points to one; do not edit generated build output.
