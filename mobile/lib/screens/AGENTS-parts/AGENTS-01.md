<!-- split from mobile/lib/screens/AGENTS.md — part 01 of 02 -->
# mobile/lib/screens/AGENTS.md — screen map & navigation anchors

One screen per file: public `XxxScreen` (stateless) + private `_XxxScreenState` (stateful). Line anchors are for commit **b7556cb** — re-derive with `rg -n "methodName" file.dart` after edits.

**Never open a file >1k lines whole** (`patient_portal_screen.dart` ~3k, `consultation_scheduler_screen.dart` ~1.7k, `documents_viewer_screen.dart` ~1.6k). Use the anchors: read a ±40-line window. For the full picture of any screen, start from `CODESLICE.md` (this directory) — a slim index routing to per-screen slice maps in `codeslice/` (plus the SOS service map). Where a sub-MD disagrees with the L-numbers below, the sub-MD is fresher.

## Universal patterns (copy these; don't invent variants)

- Token: `final _storage = const FlutterSecureStorage();` → `await _storage.read(key: 'jwt_token')`. Keys: `jwt_token`, `user_data` (written at login, login_screen L54-55).
- HTTP: `ApiConfig.client` / `http.post` + `Uri.parse('${ApiConfig.baseUrl}/api/...')`, header `{'Authorization': 'Bearer $token'}`, `if (!mounted) return;` after every await. `ApiConfig.baseUrl` is the single host definition (`lib/config/api_config.dart`) — screens must not hardcode hosts.
- Sockets: `IO.io(ApiConfig.socketUrl, ...)` in `_initXxxSocket` with the JWT in `auth`; always `disconnect()` in `dispose()`.
- UI style: `_pillInputDecoration()` — each screen defines its own copy (dedupe candidate, but keep visual parity when touching one). Toasts via `SnackBar`.
- Role routing: login sends `EMERGENCY_RESPONDER` → `ResponderScreen`, everyone else → `PatientPortalScreen` (login L64-70); splash re-validates the saved session and routes the same way (`_routeUser` L83).
- After any await before `setState`/`Navigator`: keep the `mounted` guard — silent background failures in Flutter throw otherwise.
- Server enforces RBAC/consent; any role gating in screens is UX only.

## Screens

### patient_portal_screen.dart — 3,103 lines / 123 KB. The main patient hub (3 tabs)
- **Slice map:** `codeslice/MB-01-PatientPortalScreen-parts/` (60 slices, 2 parts, verified @ 93b4172).
- `_PatientIdentity` model L32; screen state L144.
- **Consent (RA 10173 gate)**: `_checkPrivacyConsent` L252 (`GET /api/privacy/status`), `_recordConsent` L270 (POST consent), `_revokeConsent` L301, consent modal `_showConsentModal` L324, revoke dialog L405. The portal blocks on this at startup.
- **Queue**: `_initQueueSocket` L447 (socket `queue:updated` L458 → refetch), `_fetchActiveQueueTicket` L464 (`GET /api/appointments/queue/my`), active-queue card L1759.
- **QR health pass**: `_fetchQRPass` L495 (`GET /api/health-pass/token`).
- **Profile**: `_fetchProfile` L510 (`GET /api/profile/me`), profile tab L2328.
- **SOS**: hold-to-trigger button `_startHold` L591 (progress `ValueNotifier` L163, `_sosConsent` gate), `_triggerEmergencySOS` L631 (`POST /api/emergency/sos` L673), confirmation dialog L703; offline SOS queueing `_replayQueuedSosEvents` L208 (replayed on reconnect).
- **Qualified Responder** (flag from login/splash, stored in `user_data`): `_isQualifiedResponder` L171 drives (1) the header chip (build L848), (2) `startResponderListener()` on entry L193, stop on dispose L227 / sign-out. `WidgetsBindingObserver` didChangeAppLifecycleState L206 re-checks via `EmergencyAlertService().syncQualifiedResponderFlag()` on resume and refreshes the chip.
- **Offline**: `_onConnectivityChanged` L203, banner L853, call-button L2285, SMS-button L2305.
- Sign out L744 (`POST /api/auth/logout` with `fcm_token` body so the server releases the device push). Tabs: overview L1070 · SOS L1860 · profile L2328; bottom nav L886, SOS nav item L1014.
