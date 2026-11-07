# DT-03 · NurseConsole.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-03 · desktop/src/components/NurseConsole.tsx
**LOC:** 1521 · **Anchor commit:** fb9688d · **Role:** Nurse console: live triage queue, expected-arrivals check-in, active SOS alert handling, inventory stat tiles
**Mounted by:** App.tsx L763-768 when activeRoleView === 'NURSE' (viewMode/onViewModeChange props); embeds QrIntakeScanner (L1106) and InventoryManager (L411)
**API surface:** GET /api/appointments/queue/today (L149), GET /api/emergency/active (L164), PATCH /api/emergency/:alertId/status (L195), GET /api/appointments/no-shows-today (L219), GET /api/inventory/dashboard-summary (L232), GET /api/appointments/expected-today (L251), PATCH /api/appointments/queue/:queue_id/status (L335), GET /api/appointments/patient/:patient_id/active-ticket (L355), POST /api/appointments/:appointment_id/checkin (L379)
**Socket events:** on queue:updated (L277), emergency:new_alert (L283), emergency:status_change (L288), inventory:updated (L293), appointment:status_changed (L299, L313), appointment:booked (L303); no emits
**State / key fields:** View: viewMode (controlled, default triage), selectedInvTab · queue: queue, loadingQueue, waitingCount derived · SOS: sosAlerts, activeSosCount, sosBusyId · metrics: noShowCount, invStats (lowStock, expiringSoon, expired) · expected: expected, loadingExpected, checkingInId, expectedFeedback, confirmCheckIn, confirmTicketCheck · scan: verifiedPatient/scannedToken (write-only); palette C inline

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-9 | CLIENT_INSTANCE_ID | Imports: React hooks, QrIntakeScanner, InventoryManager, socket.io, API/SOCKET config, theme, Icon |
| 2 | 11-71 | interface ExpectedItem | Types: QueueItem, SosAlert, ExpectedItem, ActiveTicket (queue row, SOS payload, booking, active ticket) |
| 3 | 73-101 | NurseConsoleProps | NurseViewMode union + props; component open; core state: queue, sosAlerts, noShowCount, invStats, selectedInvTab |
| 4 | 103-115 | Expected arrivals state | Expected-arrivals state: expected, loadingExpected, checkingInId, expectedFeedback; confirm modal state |
| 5 | 117-142 | const C = { | Local palette C: primary/sage/success/warning/danger tokens |
| 6 | 144-159 | fetchLiveQueue | GET /api/appointments/queue/today; sets queue + loadingQueue |
| 7 | 161-175 | fetchActiveSosCount | GET /api/emergency/active; sets sosAlerts + activeSosCount |
| 8 | 178-214 | updateSosStatus | PATCH /api/emergency/:alertId/status (acknowledged/dispatched/resolved/false_alarm) with confirm dialogs |
| 9 | 216-244 | fetchNoShowCount | GET /api/appointments/no-shows-today (noShowCount) + GET /api/inventory/dashboard-summary (invStats) |
| 10 | 246-263 | fetchExpected | GET /api/appointments/expected-today; sets expected + loadingExpected |
| 11 | 265-275 | io(SOCKET_URL | Mount effect: initial fetches + socket.io connect (auth token, websocket/polling) |
| 12 | 277-320 | queue:updated | Socket handlers: queue:updated, emergency:new_alert, emergency:status_change, inventory:updated, appointment:* |
| 13 | 322-346 | callNextPatient | Expected-view refetch effect; callNextPatient PATCHes queue/:queue_id/status to in-consultation |
| 14 | 348-409 | executeCheckInExpected | openCheckInConfirm GETs active-ticket; executeCheckInExpected POSTs :appointment_id/checkin (409 reconfirm) |
| 15 | 411-413 | InventoryManager initialTab | Inventory view early return: renders InventoryManager with selectedInvTab |
| 16 | 415-486 | Expected arrivals | Expected view wrapper + header: calendar icon, title, pending count |
| 17 | 488-565 | Loading expected arrivals | Refresh button, expectedFeedback banner, loading + empty states |
| 18 | 567-664 | allergyIsWarning | Expected rows: time_slot, patient, student_no, appointment_type, doctor, blood, allergy warning |
| 19 | 666-708 | Walk-in? | Per-row Check in button (openCheckInConfirm); walk-in hint to Triage tab; section close |
| 20 | 710-740 | modal-backdrop | Check-in modal backdrop; ticket-check spinner (confirmTicketCheck.loading) |
| 21 | 741-817 | Patient already checked in | hasTicket branch: warning panel with existing ticket_no + status, Got it button |
| 22 | 818-912 | Confirm patient check-in | Confirm branch: patient card, student_no, scheduled time; Cancel + Confirm check-in buttons; view close |
| 23 | 914-927 | Triage view | Triage view open: waitingCount derived; sage container root div |
| 24 | 928-951 | Active SOS alerts | SOS section wrapper + header: open alert count, separate from triage queue |
| 25 | 953-1036 | statusText | SOS card per alert: name, studentNo, course, status badge, created_at, blood/allergies/phone/notes |
| 26 | 1037-1097 | False alarm | SOS actions: Acknowledge, Mark dispatched, Resolved, False alarm; Google Maps link for lat/long |
| 27 | 1099-1113 | onPatientVerified | Two-column grid: QrIntakeScanner embed; onPatientVerified refreshes live queue |
| 28 | 1114-1215 | Live triage queue | Live queue card header: icon, title, waiting count, refresh button (fetchLiveQueue + SOS) |
| 29 | 1217-1256 | Updating queue | Queue list container; loading + empty states |
| 30 | 1257-1304 | Ticket Badge | Queue row wrapper: emergency/serving styling; ticket_no badge |
| 31 | 1305-1396 | TOP PRIORITY | Row details: patient name, TOP PRIORITY badge, visit_type, student_no, status pill, arrival_time |
| 32 | 1397-1423 | Call next patient | Call next patient button (callNextPatient); queue card + grid close |
| 33 | 1425-1480 | No-shows today | Stat tiles: seen, avg wait, low stock, expiring, expired, no-shows, open SOS; inventory click-through |
| 34 | 1481-1522 | card.label | Stat tile render map; component close |
