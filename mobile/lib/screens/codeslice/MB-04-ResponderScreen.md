# MB-04 · responder_screen.dart

Mobile screens slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-04 · mobile/lib/screens/responder_screen.dart
**LOC:** 805 · **Anchor verification:** current account-theme working tree · **Role:** SOS responder dispatch console: active-emergency roster polled every 15s, acknowledge/dispatch/resolve/false-alarm, maps handoff
**Mounted by:** splash_screen.dart (L103, stored EMERGENCY_RESPONDER role) and login_screen.dart (L70, role routing)
**API surface:** GET /api/emergency/active; POST /api/auth/logout (L255, sends fcm_token); status changes via shared updateSosAlertStatus() from widgets/sos_alert_actions.dart
**Socket events:** none directly — EmergencyAlertService().startResponderListener/stopResponderListener (L41/L52) own the emergency:* socket + alarm
**State / key fields:** _activeAlerts list (L25), _isLoading (L26), 15s _pollingTimer (L27), _lastAlertAlarmedId alarm dedup (L28), brand palette consts (L30-35), widget.user role/profile map (L16)

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-17 | — | imports: http+secure storage, url_launcher, ApiConfig, Rs, sos widgets, EmergencyAlertService, screens |
| 2 | 18-25 | ResponderScreen | ResponderScreen StatefulWidget; takes user Map (roles + profile) for the dispatch console |
| 3 | 26-39 | _activeAlerts | state fields: _activeAlerts, _isLoading, _pollingTimer, _lastAlertAlarmedId; crimson/green palette consts |
| 4 | 40-58 | initState | initState: fetch alerts, startResponderListener, 15s silent poll; dispose cancels timer + stops listener |
| 5 | 59-105 | _fetchActiveAlerts | GET /api/emergency/active; dedupes triggered alert by _lastAlertAlarmedId, then SOS broadcast dialog |
| 6 | 106-140 | _updateAlertStatus | optimistic update; shared updateSosAlertStatus(); 409 already-closed (resolved/false_alarm) treated as ok |
| 7 | 141-185 | _openGoogleMaps | stops siren, geo: URI then Google Maps web URL fallback via url_launcher; snackbar on missing GPS |
| 8 | 186-265 | _handleSignOut | Confirm manual sign-out before clearing the session, then build the header |
| 9 | 266-291 | AccountSettingsButton | App bar actions for account settings, refresh, and sign-out |
| 10 | 292-330 | Ready to respond. | body RefreshIndicator + ListView; header 'PSU QUICK-RESPONSE UNIT · DISPATCH' / 'Ready to respond.' |
| 11 | 331-374 | Live responder dashboard | system status banner + stat pills row (Active incidents, Units available, Campus Lingayen) |
| 12 | 375-437 | No Active Campus Emergencies | roster: spinner while loading, empty state 'No Active Campus Emergencies', else _buildAlertCard per alert |
| 13 | 438-524 | _buildAlertCard | _buildAlertCard head: patient name, studentNo/phone, status chip (triggered crimson / dispatched green) |
| 14 | 525-567 | BLOOD TYPE | card body: BLOOD TYPE and KNOWN ALLERGY values; allergy highlighted crimson when present |
| 15 | 568-628 | GPS COORDINATES | tappable GPS COORDINATES row → _openGoogleMaps with 'Open maps' affordance |
| 16 | 629-684 | Dispatch unit | status actions: Acknowledge (triggered only) + Dispatch unit buttons → _updateAlertStatus |
| 17 | 685-762 | False alarm | Mark resolved + False alarm buttons; compact layout stacks, wide layout shows inline row |
| 18 | 763-805 | _buildStatPill | _buildStatPill: white pill with label + bold value used by the dashboard stats row |
