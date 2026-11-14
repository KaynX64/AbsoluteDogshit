# CODESLICE.md — desktop component slice map (index)

See the [desktop architecture guide](../AGENTS.md). Each desktop monolith has its own slice map in `codeslice/` — this index only routes you there.  The mobile half lives at `mobile/lib/screens/CODESLICE.md`.

**Use.** Find the file below → open its Map → read the header block (**Mounted by / API surface / Socket events / State** — often enough by itself) → `sed -n 'A,Bp' <file>` only the slice you need. **Anchors beat line numbers**: after edits re-locate with `rg -n '<anchor>' <file>`; each map records the commit it was last in sync with. Server endpoints → `server/AGENTS.md`.

**Maintain.** Edited a mapped file → in its sub-MD fix the ranges, bump its Anchor commit (`git log -1 --format=%h -- <file>`), adjust descriptions → from repo root run `python3 scripts/verify_codeslice.py desktop/docs/codeslice mobile/lib/screens/codeslice .` (every anchor must appear inside its claimed range; every `.md` in a `codeslice/` dir must be a valid slice map; a map over the 7 KB doc cap is split into `<name>-parts/`, which this script reassembles before checking). New monolith ≥ ~400 lines → add a sub-MD with the next free `DT-xx` and a row here.

---

## Quick index

| ID | File | LOC | Commit | Map | Role |
|---|------|-----|--------|-----|------|
| DT-01 | `desktop/src/features/consultations/DoctorConsole.tsx` | 2922 | working tree | `codeslice/DT-01-DoctorConsole.md` | Doctor/Dentist EMR console: consultation queue, encounters, e-Rx, clearances, dental chart, immunizations |
| DT-02 | `desktop/src/features/admin/AdminConsole.tsx` | 2330 | working tree | `codeslice/DT-02-AdminConsole.md` | Admin console: account roles, active/archived accounts, staff analytics permissions, profile editor, audit, telemetry, analytics, DB Studio |
| DT-03 | `desktop/src/features/nurse/NurseConsole.tsx` | 974 | working tree | `codeslice/DT-03-NurseConsole.md` | Nurse console: live triage queue, expected arrivals, active SOS alerts, station metrics, inventory, and scoped analytics |
| DT-04 | `desktop/src/features/inventory/InventoryManager.tsx` | 1247 | working tree | `codeslice/DT-04-InventoryManager.md` | Medicine inventory: FEFO catalog/dispense, stock-in, adjust-dispose, alerts, logs, formulary CRUD |
| DT-05 | `desktop/src/features/appointments/QrIntakeScanner.tsx` | 1264 | working tree | `codeslice/DT-05-QrIntakeScanner.md` | QR intake desk: webcam/file QR verification, ID search, triage vitals, appointment check-in, walk-in tickets; follows active theme |
| DT-06 | `desktop/src/features/analytics/AnalyticsDashboard.tsx` | 220 | working tree | `codeslice/DT-06-AnalyticsDashboard.md` | Scoped analytics shell and report actions |
| DT-07 | `desktop/src/features/documents/PrescriptionGenerator.tsx` | 763 | working tree | `codeslice/DT-07-PrescriptionGenerator.md` | e-Rx form: formulary/outside drug selection, interaction warnings, stock guards, confirm-and-issue flow |
| DT-08 | `desktop/src/features/emergency/IncidentRecords.tsx` | 994 | working tree | `codeslice/DT-08-IncidentRecords.md` | Admin view of documented SOS incidents: searchable list, server PDF preview, save and print (MinIO archive) |
| DT-09 | `desktop/src/app/App.tsx` | 529 | working tree | `codeslice/DT-09-App.md` | App shell: login/session bootstrap, role-based console routing, offline replay badge, update banner, change-password modal |
| DT-10 | `desktop/src/features/admin/CreateUserModal.tsx` | 739 | working tree | `codeslice/DT-10-CreateUserModal.md` | Admin create-user modal: role-specific fields, super/limited admin archetypes, permission codes, qualified-responder flag |
| DT-11 | `desktop/src/features/emergency/IncidentReportModal.tsx` | 543 | working tree | `codeslice/DT-11-IncidentReportModal.md` | Post-SOS-resolution incident popup: socket-driven, pre-filled patient identity, first-console-wins submit |
| DT-12 | `desktop/src/features/emergency/ResponderConsole.tsx` | 513 | working tree | `codeslice/DT-12-ResponderConsole.md` | SOS dispatch console: live alert feed, alarm + tray notifications, status workflow buttons, dev test harness |
| DT-13 | `desktop/electron/main.cjs` | 23 | working tree | `codeslice/DT-13-ElectronMain.md` | Electron main: window lifecycle, embedded SQLite offline store + IPC handlers, auto-updater, scoped TLS cert bypass |

---
