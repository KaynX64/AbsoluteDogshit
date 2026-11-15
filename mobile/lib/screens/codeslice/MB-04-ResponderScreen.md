# MB-04 · responder_screen.dart

Mobile screens slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-04 · mobile/lib/screens/responder_screen.dart
**LOC:** 791 · **Anchor verification:** current account-theme working tree · **Role:** SOS responder dispatch console: active-emergency roster polled every 15s, acknowledge/dispatch/resolve/false-alarm, maps handoff
**Mounted by:** splash_screen.dart (L103, stored EMERGENCY_RESPONDER role) and login_screen.dart (L70, role routing)
**API surface:** GET /api/emergency/active; POST /api/auth/logout (L255, sends fcm_token); status changes via shared updateSosAlertStatus() from widgets/sos_alert_actions.dart
**Socket events:** none directly — EmergencyAlertService().startResponderListener/stopResponderListener (L41/L52) own the emergency:* socket + alarm
**State / key fields:** _activeAlerts list (L25), _isLoading (L26), 15s _pollingTimer (L27), _lastAlertAlarmedId alarm dedup (L28), brand palette consts (L30-35), widget.user role/profile map (L16)

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-16 | — | imports: http+secure storage, url_launcher, ApiConfig, Rs, sos widgets, EmergencyAlertService, screens |
| 2 | 17-24 | ResponderScreen | ResponderScreen StatefulWidget; takes user Map (roles + profile) for the dispatch console |
| 3 | 25-38 | _activeAlerts | state fields: _activeAlerts, _isLoading, _pollingTimer, _lastAlertAlarmedId; crimson/green palette consts |
| 4 | 39-57 | initState | initState: fetch alerts, startResponderListener, 15s silent poll; dispose cancels timer + stops listener |
| 5 | 58-104 | _fetchActiveAlerts | GET /api/emergency/active; dedupes triggered alert by _lastAlertAlarmedId, then SOS broadcast dialog |
| 6 | 105-139 | _updateAlertStatus | optimistic update; shared updateSosAlertStatus(); 409 already-closed (resolved/false_alarm) treated as ok |
| 7 | 140-184 | _openGoogleMaps | stops siren, geo: URI then Google Maps web URL fallback via url_launcher; snackbar on missing GPS |
| 8 | 185-216 | LeoVital | build(): Scaffold + custom app bar; ValetudoLogo brand row 'LeoVital' |
| 9 | 217-277 | Icons.logout | app bar actions: key→ChangePasswordScreen, refresh, logout POST /api/auth/logout (fcm_token) → LoginScreen |
| 10 | 278-316 | Ready to respond. | body RefreshIndicator + ListView; header 'PSU QUICK-RESPONSE UNIT · DISPATCH' / 'Ready to respond.' |
| 11 | 317-360 | Live responder dashboard | system status banner + stat pills row (Active incidents, Units available, Campus Lingayen) |
| 12 | 361-423 | No Active Campus Emergencies | roster: spinner while loading, empty state 'No Active Campus Emergencies', else _buildAlertCard per alert |
| 13 | 424-510 | _buildAlertCard | _buildAlertCard head: patient name, studentNo/phone, status chip (triggered crimson / dispatched green) |
| 14 | 511-553 | BLOOD TYPE | card body: BLOOD TYPE and KNOWN ALLERGY values; allergy highlighted crimson when present |
| 15 | 554-614 | GPS COORDINATES | tappable GPS COORDINATES row → _openGoogleMaps with 'Open maps' affordance |
| 16 | 615-670 | Dispatch unit | status actions: Acknowledge (triggered only) + Dispatch unit buttons → _updateAlertStatus |
| 17 | 671-748 | False alarm | Mark resolved + False alarm buttons; compact layout stacks, wide layout shows inline row |
| 18 | 749-791 | _buildStatPill | _buildStatPill: white pill with label + bold value used by the dashboard stats row |
