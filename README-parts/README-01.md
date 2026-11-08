<!-- split from README.md — part 01 of 08 -->
# Valetudo HealthLink

> Repository: `KaynX64/AbsoluteDogshit` · GitHub description: **CC106 Project** · License: **GPL-2.0**
>
> `AbsoluteDogshit` is the repository name; the system is branded **Valetudo HealthLink** in `desktop/package.json` and `server/schema.sql`.
>
> **Documentation snapshot:** `Stage1` branch at `c8651d1ea88a438a5cc078c6613c11e35515e5c5` (2026-11-07 16:13:32 UTC). This README supersedes the 3,170-byte `AGENTS.md Pack` note currently stored as `Stage1/README.md`.

A **State University campus clinic management system**: appointments and queueing, EMR, e-prescriptions, dental charts, medicine inventory, emergency SOS, incident reporting, health passes and QR document verification. Philippine **R.A. 10173 (Data Privacy Act of 2012)** is a design constraint — treat any row containing patient data as PHI.

It is a monorepo with **three deployables** and **no npm workspaces, no root scripts and no submodules**. Each module installs and runs from its own folder; the root `package.json` only pins shared tooling (`concurrently`, `wait-on`, `electron`). `server/` owns all business logic and is the sole database owner.

**Contents:** [Stage1 changes](#what-changed-on-stage1) · [1. Tech Stack](#1-tech-stack) · [2. Features](#2-features) · [3. Architecture](#3-architecture) · [4. Data Structure](#4-data-structure) · [5. File Structure](#5-file-structure) · [6. Getting Started](#6-getting-started) · [7. Configuration](#7-configuration) · [8. Tests & Documentation Verification](#8-tests--documentation-verification) · [9. Pre-merge Checklist](#9-pre-merge-checklist-stage1--main)

---

## What changed on Stage1

`Stage1` is substantially ahead of the older project state. The visible history and tree add the following:

- **Emergency incident reporting for resolved SOS alerts**: new `INCIDENT_REPORTS` table, boot auto-migration in `server/src/db.js`, incident-report creation/fetching and pending-report endpoints in `server/src/routes/emergency.js`, `IncidentReportModal.tsx` for documentation, and `IncidentRecords.tsx` for reviewing, saving and printing official Emergency Incident Records.
- **Incident-report PDF generation**: `generateAndStoreIncidentReportPDF` from `server/src/utils/documentService.js` is imported by `emergency.js`; `server/tests/incidentReportPDF.test.js` validates rendering, including sparse data.
- **Responder capability/labeling**: new responder access helpers (`requireResponderAccess`, `redactForTier`, `getResponderAudience`, `roleLabelFor` in `server/src/utils/responderAccess.js`), `responderAccess.test.js`, a `responder:status_changed` event, and a socket client instance ID so multiple desktop instances can be distinguished.
- **Health profile and prescription fields**: `HEALTH_PROFILES.sex`, `date_of_birth` and computed `bmi`; `getBmiCategory`; appointment input validation; BMI category in route responses; `PRESCRIPTIONS.expires_at`; `PRESCRIPTION_ITEMS.quantity_dispensed` renamed to `quantity_prescribed` with validation; PDF output updated; `bmi.test.js` added; auto-migrations backfill existing records.
- **Admin health-profile management**: an admin endpoint for fetching/editing encrypted health profiles, responsive admin profile editor styles, a full diagnosis list in analytics, updated `cryptoVault.test.js`, and removal of the obsolete re-encryption test.
- **Inventory and nurse console metrics**: expired/low-stock checks, an inventory dashboard-summary endpoint for low stock / expiring soon / expired counts, live metrics and tab navigation in `NurseConsole.tsx`, and safer prescription defaults plus confirmation prompts.
- **Security and housekeeping**: `SEC-01`–`SEC-010` patch, PHI-log mandatory fields and pre-flight diagnostics, loopback-only MySQL/Redis/MinIO ports, dependency updates, duplicate immunization-route removal, user role/profile safety checks, signature/document-generator refinement with `signatory.test.js`, and `chore: untrack server node_modules`. `server/node_modules/` is no longer present in the `Stage1` tree.
- **Agent and code-navigation documentation**: root `AGENTS.md`, module `AGENTS.md` files, nested `AGENTS.md` files in decision-dense directories, `CODESLICE.md` maps, 20 per-monolith slice-map Markdown files, and `scripts/verify_codeslice.py`.

The root `AGENTS.md` describes the docs as a **four-file pack** to minimize agent token spend: routing maps, verified facts and “don’t read this” guards; root plus nested `AGENTS.md` files auto-load when an agent enters that subtree, while generated/vendor trees should not carry instructions. The `Stage1` tree now contains **at least seven `AGENTS.md` files** — root, `server/`, `desktop/`, `mobile/`, `server/src/routes/`, `desktop/src/components/` and `mobile/lib/screens/` — so the four-file description should be updated during the merge.

---
