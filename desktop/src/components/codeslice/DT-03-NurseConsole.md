# DT-03 · NurseConsole.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-03 · desktop/src/components/NurseConsole.tsx
**LOC:** 1944 · **Anchor commit:** triage-board redesign · **Role:** Nurse station: live triage queue, expected-arrivals check-in, SOS handling on every view, station metrics, inventory, and scoped analytics
**Mounted by:** App.tsx L939-944 when activeRoleView === 'NURSE' (viewMode/onViewModeChange props); embeds QrIntakeScanner (L1712) and InventoryManager (L1183)
**API surface:** GET /api/appointments/queue/today (L548), GET /api/emergency/active (L567), PATCH /api/emergency/:alertId/status (L583), GET /api/appointments/no-shows-today (L615), GET /api/inventory/dashboard-summary (L628), GET /api/appointments/expected-today (L645), PATCH /api/appointments/queue/:queue_id/status (L729), GET /api/appointments/patient/:patient_id/active-ticket (L756), POST /api/appointments/:appointment_id/checkin (L781)
**Socket events:** io() at L680. `queue:updated` (L685), `emergency:new_alert` (L691), `emergency:status_change` (L696), `inventory:updated` (L701), `appointment:status_changed` (L707 and L721), `appointment:booked` (L711, generic notification and Expected arrivals refresh). No emits.
**State / key fields:** View: viewMode (controlled, default triage), selectedInvTab · queue: queue, loadingQueue, lastSync, waiting/serving/nextInLine/waitStats (memoised) · SOS: sosAlerts, activeSosCount, sosBusyId, sosConfirm, unacknowledged, orderedSos · metrics: noShowCount, invStats (lowStock/expiringSoon/expired), stockTotal · expected: expected, loadingExpected, checkingInId, expectedFeedback, expectedQuery, overdueCount, filteredExpected · notice · tick (30s heartbeat for live wait/elapsed labels) · palette via ../theme tokens + scoped NURSE_CSS

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-30 | // desktop/src/components/NurseConsole.tsx | Header comment (design rationale) + imports: hooks, QrIntakeScanner, InventoryManager, socket.io, API config, theme presets, Icon |
| 2 | 31-95 | interface QueueItem { | Types: QueueItem (incl. queue_number), SosAlert (incl. roleLabel/medicalDetailsRedacted), ExpectedItem, ActiveTicket |
| 3 | 96-107 | export type NurseViewMode | NurseViewMode union including analytics, with controlled viewMode |
| 4 | 108-147 | function minutesSinceClock | Clock parsing: "09:30 AM" → elapsed minutes, ISO → elapsed minutes, duration() label, clockOf() |
| 5 | 148-181 | function dayLabel | dayLabel (UTC-safe TODAY / 08 Nov), isOverdue (>5 min past slot), isEmergencyTicket, allergyIsReal |
| 6 | 182-245 | const card: CSSProperties | Shared style primitives: card surface, microLabel, mono, iconChip(), smallButton(), Tone map |
| 7 | 246-292 | const NURSE_CSS | Scoped <style>: pulse/shimmer/rise/spin keyframes, KPI + row hover, responsive .nc-main split, reduced-motion |
| 8 | 293-372 | function ConsoleHeader( | Page header: live/emergency dot, title, derived subtitle, last-sync clock, refresh button with spinner |
| 9 | 373-463 | function StatTile( | Metric tile: tone accent bar, icon chip, tabular value, hint; keyboard-operable when clickable |
| 10 | 464-499 | function SkeletonRows | SkeletonRows (shimmer placeholders) + EmptyState (dashed icon card) |
| 11 | 500-541 | export default function NurseConsole( | Component open; core state: queue, lastSync, SOS, notice, inventory stats, expected + confirm modal state |
| 12 | 542-548 | const [, setTick] | 30s heartbeat used to re-render live wait / elapsed labels |
| 13 | 549-567 | const fetchLiveQueue | GET /api/appointments/queue/today → queue + lastSync |
| 14 | 568-583 | const fetchActiveSosCount | GET /api/emergency/active → sosAlerts + activeSosCount |
| 15 | 584-615 | const updateSosStatus | PATCH /api/emergency/:alertId/status; inline notice instead of window.alert, refetch after |
| 16 | 616-628 | const fetchNoShowCount | GET /api/appointments/no-shows-today |
| 17 | 629-645 | const fetchInventoryStats | GET /api/inventory/dashboard-summary → lowStock/expiringSoon/expired |
| 18 | 646-675 | const fetchExpected | GET /api/appointments/expected-today |
| 19 | 676-731 | subscribeToDesktopEvents | Mount effect: initial fetches (now includes expected) + shared socket listeners and view-specific cleanup |
| 20 | 732-758 | const callNextPatient | PATCH queue/:queue_id/status → in-consultation; picks nextInLine (emergency first) |
| 21 | 759-783 | const openCheckInConfirm | GET patient/:patient_id/active-ticket → modal state (loading / hasTicket / ticket) |
| 22 | 784-822 | const executeCheckInExpected | POST :appointment_id/checkin; 409 re-opens the ticket modal; success feedback banner |
| 23 | 823-879 | const waiting = useMemo | Derived: waiting/serving, nextInLine sort, waitStats (avg + longest), orderedSos, unacknowledged, stockTotal, overdue/filtered expected, today label |
| 24 | 880-1109 | const sosBand = | SOS band: danger header with unack control, oldest-first list, medical chips / redaction, elapsed timer, acknowledge / dispatch / resolve / false-alarm / map actions |
| 25 | 1110-1139 | const noticeBanner | Page-level feedback banner (success/error + dismiss), shared by triage and expected |
| 26 | 1141-1184 | const sosConfirmModal | In-app SOS close confirmation portal (resolved / false alarm), rendered at document.body to cover the full app window |
| 27 | 1186-1240 | InventoryManager initialTab | Inventory and Analytics share the SOS safety strip with an Open triage board action |
| 28 | 1241-1305 | title="Expected arrivals" | Expected view: ConsoleHeader + SOS band + notice + card header with search field |
| 29 | 1306-1457 | {expectedFeedback && ( | Feedback banner, skeleton/empty/no-match states, booking rows (time rail, patient, chips, overdue), walk-in hint |
| 30 | 1458-1617 | {confirmCheckIn && ( | Check-in modal: ticket-check spinner, "already checked in" branch with existing ticket, confirm branch, SOS modal mount |
| 31 | 1618-1654 | eyebrow={sosHasAlerts | Triage view root: ConsoleHeader (derived counts) + shared notice banner |
| 32 | 1655-1713 | label="Waiting now" | Vitals rail: waiting, in consultation, expected, no-shows, stock alerts (→ inventory), open SOS (→ scroll to band) |
| 33 | 1714-1725 | <div className="nc-main"> | Work surface grid: scanner column (QrIntakeScanner + onPatientVerified) |
| 34 | 1726-1890 | className="nc-queue" | Live queue card: header + count pill, skeleton/empty states, rows (ticket badge, identity, emergency chip, wait time, status) |
| 35 | 1891-1927 | onClick={callNextPatient} | Queue footer: primary "Call Q-xx next" (emergency-first styling) + triage-order hint |
| 36 | 1939-1942 | {sosConfirmModal} | SOS confirmation modal portal mount + component close |
