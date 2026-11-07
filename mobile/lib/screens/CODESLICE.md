# CODESLICE.md — mobile screens slice map (index)

Sibling of this directory's `AGENTS.md`. Each mobile monolith has its own slice map in `codeslice/` — this index only routes you there. Base commit `93b4172` (2026-11-07, `Stage1`); 7 maps / 205 slices (6 screens + the SOS service the screens share). The desktop half lives at `desktop/src/components/CODESLICE.md`.

**Use.** Find the file below → open its Map → read the header block (**Mounted by / API surface / Socket events / State** — often enough by itself) → `sed -n 'A,Bp' <file>` only the slice you need. **Anchors beat line numbers**: after edits re-locate with `rg -n '<anchor>' <file>`; each map records the commit it was last in sync with. Server endpoints → `server/AGENTS.md`.

**Maintain.** Edited a mapped file → in its sub-MD fix the ranges, bump its Anchor commit (`git log -1 --format=%h -- <file>`), adjust descriptions → from repo root run `python3 scripts/verify_codeslice.py desktop/src/components/codeslice mobile/lib/screens/codeslice .` (every anchor must appear inside its claimed range; every `.md` in a `codeslice/` dir must be a valid slice map). New monolith ≥ ~400 lines → add a sub-MD with the next free `MB-xx` and a row here.

---

## Quick index

| ID | File | LOC | Commit | Map | Role |
|---|------|-----|--------|-----|------|
| MB-01 | `mobile/lib/screens/patient_portal_screen.dart` | 3103 | 4a14140 | `codeslice/MB-01-PatientPortalScreen.md` | Patient 5-tab shell: overview/QR pass, appointments, SOS, documents, profile; queue socket, offline SOS |
| MB-02 | `mobile/lib/screens/consultation_scheduler_screen.dart` | 1695 | 7cf9f16 | `codeslice/MB-02-ConsultationSchedulerScreen.md` | Appointment booking and cancellation screen (Book a consultation + My appointments tabs) with live slot sync. |
| MB-03 | `mobile/lib/screens/documents_viewer_screen.dart` | 1576 | 7cf9f16 | `codeslice/MB-03-DocumentsViewerScreen.md` | Documents viewer: prescriptions, medical clearances, lab/imaging attachments with QR seals and PDF download. |
| MB-04 | `mobile/lib/screens/responder_screen.dart` | 795 | fb9688d | `codeslice/MB-04-ResponderScreen.md` | SOS responder dispatch console: active-emergency roster polled every 15s, acknowledge/dispatch/resolve/false-alarm, maps handoff |
| MB-05 | `mobile/lib/screens/change_password_screen.dart` | 607 | 8fcbdc7 | `codeslice/MB-05-ChangePasswordScreen.md` | Change-password form: client strength meter (0-4) + live policy checklist gating PUT /api/auth/change-password |
| MB-06 | `mobile/lib/screens/login_screen.dart` | 426 | 8fcbdc7 | `codeslice/MB-06-LoginScreen.md` | Login form: POST /api/auth/login, persists jwt_token + user_data, routes EMERGENCY_RESPONDER to ResponderScreen else PatientPortalScreen |
| MB-07 | `mobile/lib/services/emergency_alert_service.dart` | 901 | fb9688d | `codeslice/MB-07-EmergencyAlertService.md` | SERVICE (not a screen): singleton SOS backbone — emergency socket wiring, FCM push, alarm audio/vibration, SOS dialog, QR-flag audience |

---

## Small screens in this directory (one-liners)

- `mobile/lib/screens/edit_profile_screen.dart` (397): edit phone + emergency contact; PUT /api/profile/me, pop(true) on success
- `mobile/lib/screens/splash_screen.dart` (308): session bootstrap: cached jwt/user_data, GET /api/profile/me revocation check, QR-flag refresh, routes portal/responder/login

---

## Mobile small files elsewhere (one-liners)

- `mobile/lib/main.dart` (118): app entry: Firebase init + FCM bg handler, debug-only TLS override, EmergencyAlertService/Connectivity init, theme, SplashScreen home
- `mobile/lib/widgets/sos_alert_actions.dart` (182): shared SOS status path: updateSosAlertStatus() PATCH /api/emergency/:id/status (409=already closed ok) + SosAlertActions button row
- `mobile/lib/widgets/session_timeout_listener.dart` (147): inactivity wrapper (default 480 min): on timeout stops responder listener, POST /api/auth/logout (fcm_token), wipes storage, → LoginScreen
- `mobile/lib/widgets/valetudo_logo.dart` (54): stateless brand logo widget (caduceus/leaf mark) sized via parameter
- `mobile/lib/services/offline_sos_service.dart` (136): offline SOS: caches emergency contacts + medical info, queues SOS events, native call/SMS via url_launcher
- `mobile/lib/services/connectivity_service.dart` (57): connectivity_plus singleton ChangeNotifier: isOnline + transport label (WiFi/Cellular/VPN/Offline)
- `mobile/lib/config/api_config.dart` (23): single hardcoded API host point: Android LAN IP 192.168.18.116:5000 (emulator 10.0.2.2), web localhost; shared http.Client + socketUrl
- `mobile/lib/utils/responsive.dart` (94): Rs responsive scaler: clamped w/h/sp/r helpers + isCompact/isTablet breakpoints
