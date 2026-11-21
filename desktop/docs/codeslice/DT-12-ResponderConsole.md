# DT-12 · ResponderConsole.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `89592ad` · check from repo root: `python3 scripts/verify_codeslice.py desktop/docs/codeslice .`

## DT-12 · desktop/src/features/emergency/ResponderConsole.tsx
**LOC:** 513 · **Anchor commit:** working tree · **Role:** SOS dispatch console: live alert feed, alarm + tray notifications, status workflow buttons, dev test harness
**Mounted by:** App (activeRoleView EMERGENCY_RESPONDER, L453)
**API surface:** GET /api/emergency/active (L40), PATCH /api/emergency/:alertId/status (L111), POST /api/emergency/sos (L146, dev test)
**Socket events:** on emergency:new_alert (L61), on emergency:status_change (L72); emit none
**State / key fields:** activeAlerts[], loading · 3s polling interval (setInterval fetchAlerts) · per-alert statuses: triggered, acknowledged, dispatched, resolved, false_alarm

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-14 | ResponderConsole | imports (desktop realtime, theme, API, client instance, icon, time formatter); state activeAlerts/loading |
| 2 | 15-29 | playEmergencyAlarm | WebAudio sawtooth alarm beep (850 Hz, 0.6s) |
| 3 | 30-55 | fetchAlerts | GET /api/emergency/active with cancellation and silent refresh |
| 4 | 56-97 | emergency:new_alert | mount effect: initial fetch, realtime subscriptions, alarm and tray notice, status updates, 3s poll |
| 5 | 98-130 | updateStatus | PATCH /api/emergency/:id/status (X-Client-Instance-Id header); optimistic list update; refetch |
| 6 | 131-163 | handleTestDirectNotification | dev helpers: direct tray-notification test; POST /api/emergency/sos simulated SOS |
| 7 | 164-173 | statusStyle | status pill colors: triggered/acknowledged/dispatched |
| 8 | 174-189 | vd-page-head | page header: PSU Quick-Response Unit campus dispatch |
| 9 | 190-240 | Dispatch test harness | dev-only test panel: Test OS tray banner, Trigger live SOS buttons |
| 10 | 241-285 | Units available | status strip: active incidents count, units available, campus; Refresh button |
| 11 | 286-306 | All clear | loading placeholder and empty All clear state |
| 12 | 307-360 | first_name | alert card header: patient name, ID/phone, status pill |
| 13 | 361-407 | formatReportedTime | medical grid: blood type, allergy, creation time in Philippine time |
| 14 | 408-449 | GPS coordinates | GPS row: Google Maps link with lat/lng or Not available |
| 15 | 450-513 | Acknowledge | action row: Acknowledge / Dispatch team / Resolve / False alarm → updateStatus; card close |
