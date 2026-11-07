# DT-11 · IncidentReportModal.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-11 · desktop/src/components/IncidentReportModal.tsx
**LOC:** 550 · **Anchor commit:** fb9688d · **Role:** Post-SOS-resolution incident popup: socket-driven, pre-filled patient identity, first-console-wins submit
**Mounted by:** App (always mounted L786; renders null when no alert)
**API surface:** GET /api/emergency/:alertId/incident-report (L110), POST /api/emergency/:alertId/incident-report (L230)
**Socket events:** on emergency:incident_report_required (L166), on emergency:incident_reported (L174); emit none
**State / key fields:** popup: openAlertId, queue[] (queued alerts) · form: data (patient/alert/report prefill), loading, resolvedAt, incidentDetails, treatmentNotes, feedback, submitting · refs: openAlertRef, dismissedSessionRef, reportedAlertIdsRef, closePopupRef

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-21 | Post-resolution incident documentation | header comment: popup purpose, prefill GET, UNIQUE(alert_id), first console wins; imports |
| 2 | 23-55 | PatientPrefill | types PatientPrefill, AlertPrefill, ExistingReport, PrefillData |
| 3 | 57-63 | toLocalInputValue | ISO string → datetime-local local-time value helper |
| 4 | 65-83 | openAlertRef | popup + form state; refs: dismissed/reported alert sets, closePopupRef |
| 5 | 85-97 | openFor | openFor: skip already-reported/dismissed alerts; queue if another form is open |
| 6 | 100-152 | incident-report | GET prefill effect: 403→hide; existing report→auto-close; else OS tray notification |
| 7 | 155-189 | emergency:incident_report_required | socket wiring: io(SOCKET_URL, token+clientInstanceId); required→open, reported→dismiss |
| 8 | 192-211 | closePopup | closePopup(markDismissed): remember dismissal; advance queued alert after 150ms |
| 9 | 214-265 | submitReport | POST report: details>=5 + resolvedAt checks; 201 ok / 409 race lost → close |
| 10 | 267-272 | alreadyDocumented | render gate: null when idle; derive alreadyDocumented, alert a, patient p |
| 11 | 274-318 | Incident documentation | modal shell + header (SOS #id, skip × close) + intro copy |
| 12 | 320-328 | Loading incident details | loading and data-unavailable placeholders |
| 13 | 330-443 | Patient name | read-only prefill grid: name, ID number, contact, role/course, triggered at, notes |
| 14 | 445-460 | already documented | already-documented success card (another console filed it) |
| 15 | 462-477 | ir-resolved-at | datetime-local resolved-at input, pre-filled from server timestamp |
| 16 | 479-511 | ir-details | textareas: incident details (required), treatment notes (optional) |
| 17 | 513-528 | feedback | feedback banner (success/error styling) |
| 18 | 530-550 | File incident report | action row: Skip for now / File incident report (submitting state) |
