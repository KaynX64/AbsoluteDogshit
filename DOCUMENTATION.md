# Documentation index

Use this index to find the current guide for a task. Confirm behavior against source and tests; dated reviews describe the code as inspected at that time.

## Architecture and development

- [Codebase overview](CODEBASE-OVERVIEW.md) — system, workflows and architecture.
- [Backend study guide](BACKEND-STUDY-GUIDE.md) — server lifecycle, API access, storage, workflow traces, and exercises.
- [Project agent guidance](AGENTS.md) — cross-module setup, security invariants and documentation rules.
- [Server guidance](server/AGENTS.md) — routes, services, authorization, migrations and tests.
- [Desktop guidance](desktop/AGENTS.md) — Electron, renderer, offline storage and interaction conventions.
- [Mobile guidance](mobile/AGENTS.md) — Flutter architecture, settings and build instructions.

## Setup and source navigation

- [Project README](README.md) — features, architecture, local setup, API examples, and test commands.
- [Daily Docker backups](README.md#daily-mysql-and-minio-backups) · [Backup verification and restore rehearsal](scripts/backup/RESTORE.md).
- [Desktop README](desktop/README.md) · [Mobile README](mobile/README.md) — module setup and workflows.
- [Postman API guide](POSTMAN-API-GUIDE.md) — local setup, authentication, common workflows, and endpoint checks.
- [Server migration rollout](server/MIGRATION-PLAN.md) · [Server policy](server/src/config/SERVER-POLICY.md).
- [Structured prescribing API](server/STRUCTURED-PRESCRIBING.md) · [Prescribing rollout and checks](server/PRESCRIBING-ROLLOUT.md).
- [Responder records](server/RESPONDER-RECORDS.md) — alert history, desktop drafts, read-only mobile reports, permissions and migration 015.
- [Server route map](server/src/routes/AGENTS.md) · [Server utilities](server/src/utils/AGENTS.md).
- [Desktop code-slice index](desktop/docs/CODESLICE.md) · [Mobile code-slice index](mobile/lib/screens/CODESLICE.md).

## Reviews and historical material

- [Codebase review](CODEBASE-REVIEW.md) — dated assessment and checks performed.
- [Server structure review](server/STRUCTURE-REVIEW.md) — backend refactors and transaction ownership.
- [Backend performance and stability report](server/PERFORMANCE-REVIEW.md) — load, fault tests and measured priorities.
- [Mixed-load implementation results](server/MIXED-LOAD-RESULTS.md) — matched acceptance benchmarks and rollout controls.
- [Historical Stage1 README](README-parts/README-01.md) — earlier project snapshot and split reference sections.
- `audit.md`, when available locally, is an ignored historical report. Revalidate findings against the current implementation.

Keep documentation near its owner. Update the authoritative split part when its index points to one; do not edit generated build output.
