# CODESLICE.md — mobile screens slice map (index)

Sibling of this directory's `AGENTS.md`. Each mobile monolith has its own slice map in `codeslice/` — this index only routes you there. The desktop half lives at `desktop/docs/CODESLICE.md`.

**Use.** Find the file below → open its Map → read the header block (**Mounted by / API surface / Socket events / State** — often enough by itself) → `sed -n 'A,Bp' <file>` only the slice you need. **Anchors beat line numbers**: after edits re-locate with `rg -n '<anchor>' <file>`; each map records the commit it was last in sync with. Server endpoints → `server/AGENTS.md`.

**Maintain.** Edited a mapped file → in its sub-MD fix the ranges, bump its Anchor commit (`git log -1 --format=%h -- <file>`), adjust descriptions → from repo root run `python3 scripts/verify_codeslice.py desktop/docs/codeslice mobile/lib/screens/codeslice .` (every anchor must appear inside its claimed range; every `.md` in a `codeslice/` dir must be a valid slice map; a map over the 7 KB doc cap is split into `<name>-parts/`, which this script reassembles before checking). New monolith ≥ ~400 lines → add a sub-MD with the next free `MB-xx` and a row here.

---

## Quick index

| ID | File | LOC | Commit | Map | Role |
|---|------|-----|--------|-----|------|
| MB-01 | `mobile/lib/screens/patient_portal_screen.dart` | 3177 | 15ed439 | `codeslice/MB-01-PatientPortalScreen-parts/` | Patient 5-tab shell: overview/QR pass, appointments, SOS, documents, profile; queue socket, offline SOS |
| MB-02 | `mobile/lib/screens/consultation_scheduler_screen.dart` | 1695 | 7cf9f16 | `codeslice/MB-02-ConsultationSchedulerScreen.md` | Appointment booking and cancellation screen (Book a consultation + My appointments tabs) with live slot sync. |
| MB-03 | `mobile/lib/screens/documents_viewer_screen.dart` | 1576 | 7cf9f16 | `codeslice/MB-03-DocumentsViewerScreen.md` | Documents viewer: prescriptions, medical clearances, lab/imaging attachments with QR seals and PDF download. |
| MB-04 | `mobile/lib/screens/responder_screen.dart` | 80 | fb9688d | `codeslice/MB-04-ResponderScreen.md` | Dedicated responder route using the shared incident roster and duty controls. |
| MB-05 | `mobile/lib/screens/change_password_screen.dart` | 483 | 8fcbdc7 | `codeslice/MB-05-ChangePasswordScreen.md` | Change-password form with accessible field errors and a return to sign-in after success |
| MB-06 | `mobile/lib/screens/login_screen.dart` | 451 | 15ed439 | `codeslice/MB-06-LoginScreen.md` | Login form: POST /api/auth/login, persists jwt_token + user_data, routes EMERGENCY_RESPONDER to ResponderScreen else PatientPortalScreen |
| MB-07 | `mobile/lib/services/emergency_alert_service.dart` | 1020 | 3656678 | `codeslice/MB-07-EmergencyAlertService.md` | Authenticated SOS service for incident reconciliation, FCM, duty modes and foreground audio. |
| MB-08 | `mobile/lib/widgets/responder_hub.dart` | 424 | working tree | `codeslice/MB-08-ResponderHub.md` | Shared responder entry, roster, Android duty controls and incident detail sheet |

---

## Small screens in this directory (one-liners)

- `mobile/lib/screens/edit_profile_screen.dart` (397): edit phone + emergency contact; PUT /api/profile/me, pop(true) on success
- `mobile/lib/screens/splash_screen.dart`: checks the saved session and restores the account theme concurrently, refreshes the responder flag, and routes to the portal, responder console or sign-in

---

## Mobile small files elsewhere (one-liners)

- `mobile/lib/main.dart` (149): app entry, debug-only TLS override, theme, and splash route. Starts Firebase, Android notifications and connectivity monitoring after the first frame.
- `mobile/lib/widgets/sos_alert_actions.dart`: shared SOS actions with confirmed closure and in-flight submission guards
- `mobile/lib/widgets/session_timeout_listener.dart`: inactivity wrapper that ends the alert session and returns to login
- `mobile/lib/widgets/valetudo_logo.dart` (56): brand logo with display-size image decoding and an optional rounded splash card
- `mobile/lib/services/offline_sos_service.dart` (136): offline SOS: caches emergency contacts + medical info, queues SOS events, native call/SMS via url_launcher
- `mobile/lib/services/connectivity_service.dart` (71): connectivity_plus singleton ChangeNotifier: isOnline + transport label (WiFi/Cellular/VPN/Offline)
- `mobile/lib/config/api_config.dart` (23): single hardcoded API host point: Android LAN IP 192.168.18.116:5000 (emulator 10.0.2.2), web localhost; shared http.Client + socketUrl
- `mobile/lib/utils/responsive.dart` (94): Rs responsive scaler: clamped w/h/sp/r helpers + isCompact/isTablet breakpoints
