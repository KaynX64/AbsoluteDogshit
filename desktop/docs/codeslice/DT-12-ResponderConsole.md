# DT-12 · ResponderConsole.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `89592ad` · check from repo root: `python3 scripts/verify_codeslice.py desktop/docs/codeslice .`

## DT-12 · desktop/src/features/emergency/ResponderConsole.tsx
**LOC:** 528 · **Anchor commit:** 265ff8e · **Role:** SOS dispatch console: live alert feed, alarm + tray notifications, status workflow buttons, dev test harness
**Mounted by:** App (activeRoleView EMERGENCY_RESPONDER), inside ResponderAccessProvider
**API surface:** GET /api/emergency/active, PATCH /api/emergency/:alertId/status, POST /api/emergency/sos (dev test); session access via ResponderAccessProvider
**Socket events:** emergency:new_alert, emergency:status_change, reconnect; emit none
**State / key fields:** activeAlerts[], loading · 3s polling interval (setInterval fetchAlerts) · per-alert statuses: triggered, acknowledged, dispatched, resolved, false_alarm

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-18 | ResponderConsole | imports (desktop realtime, theme, API, client instance, icon, time formatter); state activeAlerts/loading |
| 2 | 19-33 | playEmergencyAlarm | WebAudio sawtooth alarm beep (850 Hz, 0.6s) |
| 3 | 34-67 | fetchAlerts | GET /api/emergency/active with cancellation and silent refresh |
| 4 | 68-111 | emergency:new_alert | mount effect: initial fetch, realtime subscriptions, alarm and tray notice, status updates, 3s poll |
| 5 | 112-141 | updateStatus | PATCH /api/emergency/:id/status (X-Client-Instance-Id header); live-tier action guard, in-flight submission guard, permission refresh and refetch |
| 6 | 142-174 | handleTestDirectNotification | dev helpers: direct tray-notification test; POST /api/emergency/sos simulated SOS |
| 7 | 175-184 | statusStyle | status pill colors: triggered/acknowledged/dispatched |
| 8 | 185-200 | vd-page-head | page header: PSU Quick-Response Unit campus dispatch |
| 9 | 201-251 | Dispatch test harness | dev-only test panel: Test OS tray banner, Trigger live SOS buttons |
| 10 | 252-296 | Units available | status strip: active incidents count, units available, campus; Refresh button |
| 11 | 297-317 | All clear | loading placeholder and empty All clear state |
| 12 | 318-371 | first_name | alert card header: patient name, ID/phone, status pill |
| 13 | 372-418 | formatReportedTime | medical grid: blood type, allergy, creation time in Philippine time |
| 14 | 419-460 | GPS coordinates | GPS row: Google Maps link with lat/lng or Not available |
| 15 | 461-528 | Acknowledge | action row: community acknowledgment; clinical Dispatch team / Resolve / False alarm → updateStatus; card close |
