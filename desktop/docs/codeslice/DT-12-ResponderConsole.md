# DT-12 · ResponderConsole.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `89592ad` · check from repo root: `python3 scripts/verify_codeslice.py desktop/docs/codeslice .`

## DT-12 · desktop/src/features/emergency/ResponderConsole.tsx
**LOC:** 550 · **Anchor commit:** 265ff8e · **Role:** SOS dispatch console: live alert feed, alarm + tray notifications, status workflow buttons, dev test harness
**Mounted by:** App (activeRoleView EMERGENCY_RESPONDER), inside ResponderAccessProvider
**API surface:** GET /api/emergency/active, PATCH /api/emergency/:alertId/status, POST /api/emergency/sos (dev test); session access via ResponderAccessProvider
**Socket events:** emergency:new_alert, emergency:status_change, reconnect; emit none
**State / key fields:** activeAlerts[], loading · 3s polling interval (setInterval fetchAlerts) · per-alert statuses: triggered, acknowledged, dispatched, resolved, false_alarm

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-18 | ResponderConsole | imports (desktop realtime, theme, API, client instance, icon, time formatter); state activeAlerts/loading |
| 2 | 19-56 | playEmergencyAlarm | WebAudio sawtooth alarm beep (850 Hz, 0.6s) |
| 3 | 57-89 | fetchAlerts | GET /api/emergency/active with cancellation and silent refresh |
| 4 | 90-133 | emergency:new_alert | mount effect: initial fetch, realtime subscriptions, alarm and tray notice, status updates, 3s poll |
| 5 | 134-163 | updateStatus | PATCH /api/emergency/:id/status (X-Client-Instance-Id header); live-tier action guard, in-flight submission guard, permission refresh and refetch |
| 6 | 164-197 | handleTestDirectNotification | dev helpers: direct tray-notification test; POST /api/emergency/sos simulated SOS |
| 7 | 198-210 | statusStyle | status pill colors: triggered/acknowledged/dispatched |
| 8 | 211-222 | vd-page-head | page header: PSU Quick-Response Unit campus dispatch |
| 9 | 223-273 | Dispatch test harness | dev-only test panel: Test OS tray banner, Trigger live SOS buttons |
| 10 | 274-318 | Units available | status strip: active incidents count, units available, campus; Refresh button |
| 11 | 319-339 | All clear | loading placeholder and empty All clear state |
| 12 | 340-405 | first_name | alert card header: patient name, ID/phone, status pill |
| 13 | 406-451 | formatReportedTime | medical grid: blood type, allergy, creation time in Philippine time |
| 14 | 452-479 | GPS coordinates | GPS row: Google Maps link with lat/lng or Not available |
| 15 | 480-550 | Acknowledge | action row: community acknowledgment; clinical Dispatch team / Resolve / False alarm → updateStatus; card close |
