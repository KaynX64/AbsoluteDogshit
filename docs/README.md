# Documentation index

Project-wide guidance lives here. Module setup starts from each module's README or `AGENTS.md`. Dated reviews describe the code as inspected at the time.

## Architecture and development

- [Codebase overview](architecture/CODEBASE-OVERVIEW.md) — system, workflows and architecture.
- [Project agent guidance](../AGENTS.md) — cross-module setup, security invariants and documentation rules.
- [Server guidance](../server/AGENTS.md) — routes, services, authorization, migrations and tests.
- [Desktop guidance](../desktop/AGENTS.md) — Electron, renderer, offline storage and interaction conventions.
- [Mobile guidance](../mobile/AGENTS.md) — Flutter architecture, settings and build instructions.

## Setup and source navigation

- [Project README](../README.md) — features, architecture, local setup, API examples, and test commands.
- [Daily Docker backups](../README.md#daily-mysql-and-minio-backups) · [Backup verification and restore rehearsal](../scripts/backup/RESTORE.md).
- [Desktop README](../desktop/README.md) · [Mobile README](../mobile/README.md) — module setup and workflows.
- [Mobile OAuth preflight](agent-guidance/MOBILE-OAUTH-PREFLIGHT.md) — agent checks for local tooling, API configuration, Google client IDs and signing.
- [Mobile performance and verification](../mobile/docs/PERFORMANCE.md) — runtime and profiling checks.
- [Server migration rollout](../server/docs/migrations/MIGRATION-PLAN.md) · [Server policy](../server/src/config/SERVER-POLICY.md).
- [Appointment email setup](../README.md#appointment-email) · [Reminder timing and Admin Console test emails](../server/src/config/SERVER-POLICY.md#appointment-reminders).
- [Responder qualification process](../server/docs/workflows/RESPONDER-QUALIFICATIONS.md) — applications, clinic assessments, appointment access, rollout and synthetic data.
- [Structured prescribing API](../server/docs/workflows/STRUCTURED-PRESCRIBING.md) · [Prescribing rollout and checks](../server/docs/workflows/PRESCRIBING-ROLLOUT.md).
- [Responder records](../server/docs/workflows/RESPONDER-RECORDS.md) — alert history, desktop drafts, read-only mobile reports, permissions and migration 015.
- [Server route map](../server/src/routes/AGENTS.md) · [Server utilities](../server/src/utils/AGENTS.md).
- [Desktop code-slice index](../desktop/docs/CODESLICE.md) · [Mobile code-slice index](../mobile/lib/screens/CODESLICE.md).

## Reviews and historical material

- [Codebase review](history/CODEBASE-REVIEW.md) — dated assessment and checks performed.
- [Server structure review](../server/docs/reviews/STRUCTURE-REVIEW.md) — backend refactors and transaction ownership.
- [Backend performance and stability report](../server/docs/reviews/PERFORMANCE-REVIEW.md) — load, fault tests and measured priorities.
- [Mixed-load implementation results](../server/docs/reviews/MIXED-LOAD-RESULTS.md) — matched acceptance benchmarks and rollout controls.
- [Historical Stage1 README](history/stage1/README-01.md) — earlier project snapshot and split reference sections.
- `audit.md`, when available locally, is an ignored historical report. Revalidate findings against the current implementation.

Keep project-wide guides in `docs/` and module reference guides in the owning module's `docs/`. Keep setup entry points, scoped `AGENTS.md` files and source navigation with the code they cover.
