# CODESLICE.md — mobile screens slice map (index)

Sibling of this directory's `AGENTS.md`. Each mobile monolith has its own slice map in `codeslice/` — this index only routes you there. The desktop half lives at `desktop/docs/CODESLICE.md`.

**Use.** Find the file below → open its Map → read the header block (**Mounted by / API surface / Socket events / State** — often enough by itself) → `sed -n 'A,Bp' <file>` only the slice you need. **Anchors beat line numbers**: after edits re-locate with `rg -n '<anchor>' <file>`; each map records the commit it was last in sync with. Server endpoints → `server/AGENTS.md`.

**Maintain.** Edited a mapped file → in its sub-MD fix the ranges, bump its Anchor commit (`git log -1 --format=%h -- <file>`), adjust descriptions → from repo root run `python3 scripts/verify_codeslice.py desktop/docs/codeslice mobile/lib/screens/codeslice .` (every anchor must appear inside its claimed range; every `.md` in a `codeslice/` dir must be a valid slice map; a map over the 7 KB doc cap is split into `<name>-parts/`, which this script reassembles before checking). New monolith ≥ ~400 lines → add a sub-MD with the next free `MB-xx` and a row here.

---

## Quick index

| ID | File | LOC | Commit | Map | Role |
|---|------|-----|--------|-----|------|
| MB-01 | `mobile/lib/screens/patient_portal_screen.dart` | 3545 | e0aadaa | `codeslice/MB-01-PatientPortalScreen-parts/` | Patient 5-tab shell: overview/QR pass, appointments, SOS, documents, profile; queue socket, offline SOS |
| MB-02 | `mobile/lib/screens/consultation_scheduler_screen.dart` | 2235 | f8d61a1 | `codeslice/MB-02-ConsultationSchedulerScreen.md` | Appointment booking and cancellation screen (Book a consultation + My appointments tabs) with live slot sync. |
| MB-03 | `mobile/lib/screens/documents_viewer_screen.dart` | 2140 | working tree | `codeslice/MB-03-DocumentsViewerScreen.md` | Documents viewer: immutable recorded prescriptions, clearances, lab/imaging, QR verification and streamed PDF download. |
| MB-04 | `mobile/lib/screens/responder_screen.dart` | 88 | working tree | `codeslice/MB-04-ResponderScreen.md` | Dedicated responder route using the shared incident roster and duty controls. |
| MB-05 | `mobile/lib/screens/change_password_screen.dart` | 483 | 500434b | `codeslice/MB-05-ChangePasswordScreen.md` | Change-password form with accessible field errors and a return to sign-in after success |
| MB-06 | `mobile/lib/screens/login_screen.dart` | 468 | 500434b | `codeslice/MB-06-LoginScreen.md` | Login form: POST /api/auth/login, persists jwt_token + user_data, routes EMERGENCY_RESPONDER to ResponderScreen else PatientPortalScreen |
| MB-07 | `mobile/lib/services/emergency_alert_service.dart` | 1196 | working tree | `codeslice/MB-07-EmergencyAlertService.md` | Authenticated SOS service for incident reconciliation, FCM, duty modes and foreground audio. |
| MB-08 | `mobile/lib/widgets/responder_hub.dart` | 514 | working tree | `codeslice/MB-08-ResponderHub.md` | Shared responder entry, roster, Android duty controls and incident detail sheet |
| MB-09 | `mobile/lib/screens/responder_records_view.dart` | 532 | working tree | `codeslice/MB-09-ResponderRecordsView.md` | Searchable read-only alert history and pending/filed incident reports |

---

## Small screens in this directory (one-liners)

- `mobile/lib/screens/edit_profile_screen.dart`: edit phone + emergency contact; PUT /api/profile/me, pop(true) on success
- `mobile/lib/screens/splash_screen.dart`: checks the saved session and restores the account theme concurrently, starts the authenticated alert session, and routes to the portal, responder console or sign-in

---

## Other mobile entry points and helpers

- `mobile/lib/main.dart`: app entry, debug-only TLS override, theme, and splash route. Starts Firebase, Android notifications and connectivity monitoring after the first frame.
- `mobile/lib/widgets/sos_alert_actions.dart`: shared SOS actions with confirmed closure and in-flight submission guards
- `mobile/lib/widgets/session_timeout_listener.dart`: inactivity wrapper that ends the alert session and returns to login
- `mobile/lib/widgets/valetudo_logo.dart`: brand logo with display-size image decoding and an optional rounded splash card
- `mobile/lib/services/offline_sos_service.dart`: offline SOS: caches emergency contacts + medical info, queues SOS events, native call/SMS via url_launcher
- `mobile/lib/services/mobile_session_data.dart`: memory-only session datasets, request sharing, freshness, guarded preloading, tab drafts and PageStorage; see `mobile/PERFORMANCE.md`
- `mobile/lib/services/document_download.dart`: authenticated streaming PDF download and partial-file cleanup
- `mobile/lib/widgets/lazy_card_columns.dart`: independent lazy sliver columns preserving existing grid geometry
- `mobile/lib/services/connectivity_service.dart`: connectivity_plus singleton ChangeNotifier: isOnline + transport label (WiFi/Cellular/VPN/Offline)
- `mobile/lib/config/api_config.dart`: single hardcoded API host point: Android LAN address (emulator 10.0.2.2), web localhost; shared http.Client + socketUrl
- `mobile/lib/utils/responsive.dart`: Rs responsive scaler: clamped w/h/sp/r helpers + isCompact/isTablet breakpoints

- `mobile/lib/widgets/responder_workspace.dart`: staff Alerts/History/Reports navigation and pending badge; community accounts keep the active Hub.
- `mobile/lib/screens/responder_record_detail.dart`: read-only timeline, filed narrative and authorized PDF opening.
