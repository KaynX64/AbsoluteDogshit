# CODESLICE.md — desktop component slice map (index)

Sibling of this directory's `AGENTS.md`. Each desktop monolith has its own slice map in `codeslice/` — this index only routes you there. Base commit `93b4172` (2026-11-07, `Stage1`); 13 maps / 384 slices. The mobile half lives at `mobile/lib/screens/CODESLICE.md`.

**Use.** Find the file below → open its Map → read the header block (**Mounted by / API surface / Socket events / State** — often enough by itself) → `sed -n 'A,Bp' <file>` only the slice you need. **Anchors beat line numbers**: after edits re-locate with `rg -n '<anchor>' <file>`; each map records the commit it was last in sync with. Server endpoints → `server/AGENTS.md`.

**Maintain.** Edited a mapped file → in its sub-MD fix the ranges, bump its Anchor commit (`git log -1 --format=%h -- <file>`), adjust descriptions → from repo root run `python3 scripts/verify_codeslice.py desktop/src/components/codeslice mobile/lib/screens/codeslice .` (every anchor must appear inside its claimed range; every `.md` in a `codeslice/` dir must be a valid slice map; a map over the 7 KB doc cap is split into `<name>-parts/`, which this script reassembles before checking). New monolith ≥ ~400 lines → add a sub-MD with the next free `DT-xx` and a row here.

---

## Quick index

| ID | File | LOC | Commit | Map | Role |
|---|------|-----|--------|-----|------|
| DT-01 | `desktop/src/components/DoctorConsole.tsx` | 4366 | 4a14140 | `codeslice/DT-01-DoctorConsole-parts/` | Doctor/Dentist EMR console: consultation queue, encounters, e-Rx, clearances, dental chart, immunizations |
| DT-02 | `desktop/src/components/AdminConsole.tsx` | 3054 | 93b4172 | `codeslice/DT-02-AdminConsole-parts/` | Admin console: roles mgmt, qualified-responder flag, profile editor, audit, telemetry, analytics, DB Studio |
| DT-03 | `desktop/src/components/NurseConsole.tsx` | 1941 | fb9688d | `codeslice/DT-03-NurseConsole.md` | Nurse console: live triage queue, expected-arrivals check-in, active SOS alert handling, inventory stat tiles |
| DT-04 | `desktop/src/components/InventoryManager.tsx` | 1464 | ed2c817 | `codeslice/DT-04-InventoryManager.md` | Medicine inventory: FEFO catalog/dispense, stock-in, adjust-dispose, alerts, logs, formulary CRUD |
| DT-05 | `desktop/src/components/QrIntakeScanner.tsx` | 1440 | ee8bbe5 | `codeslice/DT-05-QrIntakeScanner.md` | QR intake desk: webcam/file QR verification, ID search, triage vitals, appointment check-in, walk-in tickets; follows active theme |
| DT-06 | `desktop/src/components/AnalyticsDashboard.tsx` | 1350 | ba200f6 | `codeslice/DT-06-AnalyticsDashboard.md` | Analytics dashboard: hand-rolled SVG charts (no chart lib), KPI cards, flu spike banner, XLSX/PDF exports |
| DT-07 | `desktop/src/components/PrescriptionGenerator.tsx` | 1077 | ba200f6 | `codeslice/DT-07-PrescriptionGenerator.md` | e-Rx form: formulary/outside drug selection, interaction warnings, stock guards, confirm-and-issue flow |
| DT-08 | `desktop/src/components/IncidentRecords.tsx` | 1001 | 93b4172 | `codeslice/DT-08-IncidentRecords.md` | Admin view of documented SOS incidents: searchable list, server PDF preview, save and print (MinIO archive) |
| DT-09 | `desktop/src/App.tsx` | 1096 | working tree | `codeslice/DT-09-App.md` | App shell: login/session bootstrap, role-based console routing, offline replay badge, update banner, change-password modal |
| DT-10 | `desktop/src/components/CreateUserModal.tsx` | 726 | 4a14140 | `codeslice/DT-10-CreateUserModal.md` | Admin create-user modal: role-specific fields, super/limited admin archetypes, permission codes, qualified-responder flag |
| DT-11 | `desktop/src/components/IncidentReportModal.tsx` | 550 | fb9688d | `codeslice/DT-11-IncidentReportModal.md` | Post-SOS-resolution incident popup: socket-driven, pre-filled patient identity, first-console-wins submit |
| DT-12 | `desktop/src/components/ResponderConsole.tsx` | 495 | fb9688d | `codeslice/DT-12-ResponderConsole.md` | SOS dispatch console: live alert feed, alarm + tray notifications, status workflow buttons, dev test harness |
| DT-13 | `desktop/electron/main.cjs` | 493 | 1a5c9d7 | `codeslice/DT-13-ElectronMain.md` | Electron main: window lifecycle, embedded SQLite offline store + IPC handlers, auto-updater, scoped TLS cert bypass |

---

## Small components in this directory (one-liners)

- `desktop/src/components/Icon.tsx` (366): Material Symbols font-ligature Icon component (name/size/tone props) used app-wide
- `desktop/src/components/EmergencyAlertBanner.tsx` (258): Doctor-console SOS banner: live alert feed and status updates
- `desktop/src/components/ServerPingMonitor.tsx` (216): Server latency panel: ping sparkline + jitter/loss stats fed by useServerPing hook
- `desktop/src/components/PasswordStrengthIndicator.tsx` (180): Password meter + evaluatePassword() policy scorer (score>=Medium, all rules)
- `desktop/src/components/InteractionWarning.tsx` (168): Drug-drug interaction warning cards (severity colors) for the prescription form
- `desktop/src/components/DentalChart.tsx` (161): Tooth-grid chart editor: per-tooth condition (sound/caries/filled/missing...) + notes
- `desktop/src/components/SignaturePad.tsx` (141): Canvas signature pad (signature_pad) exporting trimmed transparent PNG blob
- `desktop/src/components/SignatureEnrollment.tsx` (124): Doctor/dentist signature enroll/renew panel wrapping SignaturePad, saved via API
- `desktop/src/components/VaccinationInputter.tsx` (0): Empty placeholder file (0 bytes; reserved, not implemented)

---

## Desktop small files elsewhere (one-liners)

- `desktop/src/services/offlineSync.ts` (261): Offline mutation queue + cache bootstrap: Electron IPC SQLite, localStorage mirror, replay
- `desktop/src/services/interactionService.ts` (106): checkDrugInteractions(medicineIds) client for POST /api/interactions/check
- `desktop/src/services/clientInstance.ts` (1): Exports per-window CLIENT_INSTANCE_ID (crypto.randomUUID) for socket auth
- `desktop/src/hooks/useServerPing.ts` (97): Hook polling backend latency every 5s; exposes stats + server-ping window events
- `desktop/src/hooks/useBookingBadge.ts` (66): Sidebar booking badge count per role; refreshes on appointment socket events
- `desktop/src/config/api.ts` (5): API_BASE_URL + SOCKET_URL from app-config.json (build-time baked)
- `desktop/src/theme/index.ts` (653): Design tokens (T palette) + shared CSSProperties presets (cards, pills, buttons)
- `desktop/src/index.css` (2107): Global stylesheet: design language, sidebar/topbar/login, tables, modals, pills
- `desktop/electron/preload.cjs` (25): contextBridge exposing electronAPI: print, notify, offline-sync IPC, updater
