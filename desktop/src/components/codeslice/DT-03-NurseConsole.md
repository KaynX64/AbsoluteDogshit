# DT-03 · NurseConsole.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-03 · desktop/src/components/NurseConsole.tsx
**LOC:** 1943 · **Anchor commit:** triage-board redesign · **Role:** Nurse station: live triage queue, expected-arrivals check-in, SOS handling on every view, derived station metrics, inventory hand-off
**Mounted by:** App.tsx L939-944 when activeRoleView === 'NURSE' (viewMode/onViewModeChange props); embeds QrIntakeScanner (L1712) and InventoryManager (L1183)
**API surface:** GET /api/appointments/queue/today (L548), GET /api/emergency/active (L567), PATCH /api/emergency/:alertId/status (L583), GET /api/appointments/no-shows-today (L615), GET /api/inventory/dashboard-summary (L628), GET /api/appointments/expected-today (L645), PATCH /api/appointments/queue/:queue_id/status (L729), GET /api/appointments/patient/:patient_id/active-ticket (L756), POST /api/appointments/:appointment_id/checkin (L781)
**Socket events:** io() at L680. `queue:updated` (L685), `emergency:new_alert` (L691), `emergency:status_change` (L696), `inventory:updated` (L701), `appointment:status_changed` (L707 and L721), `appointment:booked` (L711, generic notification and Expected arrivals refresh). No emits.
**State / key fields:** View: viewMode (controlled, default triage), selectedInvTab · queue: queue, loadingQueue, lastSync, waiting/serving/nextInLine/waitStats (memoised) · SOS: sosAlerts, activeSosCount, sosBusyId, sosConfirm, unacknowledged, orderedSos · metrics: noShowCount, invStats (lowStock/expiringSoon/expired), stockTotal · expected: expected, loadingExpected, checkingInId, expectedFeedback, expectedQuery, overdueCount, filteredExpected · notice · tick (30s heartbeat for live wait/elapsed labels) · palette via ../theme tokens + scoped NURSE_CSS

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-29 | // desktop/src/components/NurseConsole.tsx | Header comment (design rationale) + imports: hooks, QrIntakeScanner, InventoryManager, socket.io, API config, theme presets, Icon |
| 2 | 30-94 | interface QueueItem { | Types: QueueItem (incl. queue_number), SosAlert (incl. roleLabel/medicalDetailsRedacted), ExpectedItem, ActiveTicket |
| 3 | 95-106 | export type NurseViewMode | NurseViewMode union + NurseConsoleProps (controlled viewMode) |
| 4 | 107-146 | function minutesSinceClock | Clock parsing: "09:30 AM" → elapsed minutes, ISO → elapsed minutes, duration() label, clockOf() |
| 5 | 147-180 | function dayLabel | dayLabel (UTC-safe TODAY / 08 Nov), isOverdue (>5 min past slot), isEmergencyTicket, allergyIsReal |
| 6 | 181-244 | const card: CSSProperties | Shared style primitives: card surface, microLabel, mono, iconChip(), smallButton(), Tone map |
| 7 | 245-291 | const NURSE_CSS | Scoped <style>: pulse/shimmer/rise/spin keyframes, KPI + row hover, responsive .nc-main split, reduced-motion |
| 8 | 292-371 | function ConsoleHeader( | Page header: live/emergency dot, title, derived subtitle, last-sync clock, refresh button with spinner |
| 9 | 372-462 | function StatTile( | Metric tile: tone accent bar, icon chip, tabular value, hint; keyboard-operable when clickable |
| 10 | 463-498 | function SkeletonRows | SkeletonRows (shimmer placeholders) + EmptyState (dashed icon card) |
| 11 | 499-540 | export default function NurseConsole( | Component open; core state: queue, lastSync, SOS, notice, inventory stats, expected + confirm modal state |
| 12 | 541-547 | const [, setTick] | 30s heartbeat used to re-render live wait / elapsed labels |
| 13 | 548-566 | const fetchLiveQueue | GET /api/appointments/queue/today → queue + lastSync |
| 14 | 567-582 | const fetchActiveSosCount | GET /api/emergency/active → sosAlerts + activeSosCount |
| 15 | 583-614 | const updateSosStatus | PATCH /api/emergency/:alertId/status; inline notice instead of window.alert, refetch after |
| 16 | 615-627 | const fetchNoShowCount | GET /api/appointments/no-shows-today |
| 17 | 628-644 | const fetchInventoryStats | GET /api/inventory/dashboard-summary → lowStock/expiringSoon/expired |
| 18 | 645-674 | const fetchExpected | GET /api/appointments/expected-today |
| 19 | 675-730 | subscribeToDesktopEvents | Mount effect: initial fetches (now includes expected) + shared socket listeners and view-specific cleanup |
| 20 | 731-757 | const callNextPatient | PATCH queue/:queue_id/status → in-consultation; picks nextInLine (emergency first) |
| 21 | 758-782 | const openCheckInConfirm | GET patient/:patient_id/active-ticket → modal state (loading / hasTicket / ticket) |
| 22 | 783-821 | const executeCheckInExpected | POST :appointment_id/checkin; 409 re-opens the ticket modal; success feedback banner |
| 23 | 822-878 | const waiting = useMemo | Derived: waiting/serving, nextInLine sort, waitStats (avg + longest), orderedSos, unacknowledged, stockTotal, overdue/filtered expected, today label |
| 24 | 879-1108 | const sosBand = | SOS band: danger header with unack control, oldest-first list, medical chips / redaction, elapsed timer, acknowledge / dispatch / resolve / false-alarm / map actions |
| 25 | 1109-1138 | const noticeBanner | Page-level feedback banner (success/error + dismiss), shared by triage and expected |
| 26 | 1140-1183 | const sosConfirmModal | In-app SOS close confirmation portal (resolved / false alarm), rendered at document.body to cover the full app window |
| 27 | 1185-1239 | if (viewMode === 'inventory') | Inventory view: flex column wrapper + SOS safety strip with "Open triage board", then InventoryManager(initialTab) |
| 28 | 1240-1304 | title="Expected arrivals" | Expected view: ConsoleHeader + SOS band + notice + card header with search field |
| 29 | 1305-1456 | {expectedFeedback && ( | Feedback banner, skeleton/empty/no-match states, booking rows (time rail, patient, chips, overdue), walk-in hint |
| 30 | 1457-1616 | {confirmCheckIn && ( | Check-in modal: ticket-check spinner, "already checked in" branch with existing ticket, confirm branch, SOS modal mount |
| 31 | 1617-1653 | eyebrow={sosHasAlerts | Triage view root: ConsoleHeader (derived counts) + shared notice banner |
| 32 | 1654-1712 | label="Waiting now" | Vitals rail: waiting, in consultation, expected, no-shows, stock alerts (→ inventory), open SOS (→ scroll to band) |
| 33 | 1713-1724 | <div className="nc-main"> | Work surface grid: scanner column (QrIntakeScanner + onPatientVerified) |
| 34 | 1725-1889 | className="nc-queue" | Live queue card: header + count pill, skeleton/empty states, rows (ticket badge, identity, emergency chip, wait time, status) |
| 35 | 1890-1926 | onClick={callNextPatient} | Queue footer: primary "Call Q-xx next" (emergency-first styling) + triage-order hint |
| 36 | 1938-1941 | {sosConfirmModal} | SOS confirmation modal portal mount + component close |
