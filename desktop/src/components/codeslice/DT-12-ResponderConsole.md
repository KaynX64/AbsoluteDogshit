# DT-12 · ResponderConsole.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-12 · desktop/src/components/ResponderConsole.tsx
**LOC:** 495 · **Anchor commit:** fb9688d · **Role:** SOS dispatch console: live alert feed, alarm + tray notifications, status workflow buttons, dev test harness
**Mounted by:** App (activeRoleView EMERGENCY_RESPONDER, L779)
**API surface:** GET /api/emergency/active (L33), PATCH /api/emergency/:alertId/status (L98), POST /api/emergency/sos (L129, dev test)
**Socket events:** on emergency:new_alert (L54), on emergency:status_change (L65); emit none
**State / key fields:** activeAlerts[], loading · 3s polling interval (setInterval fetchAlerts) · per-alert statuses: triggered, acknowledged, dispatched, resolved, false_alarm

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-11 | ResponderConsole | imports (io, theme, API/SOCKET_URL, CLIENT_INSTANCE_ID, Icon); state activeAlerts/loading |
| 2 | 13-26 | playEmergencyAlarm | WebAudio sawtooth alarm beep (850 Hz, 0.6s) |
| 3 | 28-43 | fetchAlerts | GET /api/emergency/active; silent mode flag |
| 4 | 45-83 | emergency:new_alert | mount effect: initial fetch, socket connect; new_alert→alarm+tray notify; status_change update; 3s poll |
| 5 | 85-112 | updateStatus | PATCH /api/emergency/:id/status (X-Client-Instance-Id header); optimistic list update; refetch |
| 6 | 114-145 | handleTestDirectNotification | dev helpers: direct tray-notification test; POST /api/emergency/sos simulated SOS |
| 7 | 147-155 | statusStyle | status pill colors: triggered/acknowledged/dispatched |
| 8 | 157-170 | vd-page-head | page header: PSU Quick-Response Unit campus dispatch |
| 9 | 172-221 | Dispatch test harness | dev-only test panel: Test OS tray banner, Trigger live SOS buttons |
| 10 | 223-266 | Units available | status strip: active incidents count, units available, campus; Refresh button |
| 11 | 268-287 | All clear | loading placeholder and empty All clear state |
| 12 | 289-341 | first_name | alert card header: patient name, ID/phone, status pill |
| 13 | 343-388 | Blood type | medical grid: blood type, allergy (warning color), reported time |
| 14 | 390-430 | GPS coordinates | GPS row: Google Maps link with lat/lng or Not available |
| 15 | 432-494 | Acknowledge | action row: Acknowledge / Dispatch team / Resolve / False alarm → updateStatus; card close |
