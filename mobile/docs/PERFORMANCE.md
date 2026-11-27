# Mobile performance and verification

## Runtime behavior

`MobileSessionData` holds memory-only data for the authenticated session. The alert session begins and clears it on authentication and termination, including password changes and consent-revocation sign-out. Request generations prevent a late response from populating another session's cache. Screen responses and saved tab state also check that generation.

Doctor metadata stays fresh for five minutes. Document lists and appointment history stay fresh for 60 seconds. There is only one cached clinician/date availability result; opening Appointments and confirming a reviewed booking always recheck availability. The server remains the authority for booking conflicts. Realtime invalidation schedules a debounced refresh for the visible document or appointment list. Resume and reconnect also refresh visible lists. Previously loaded rows stay mounted during a refresh.

After consent and initial dashboard loading, the portal speculatively loads doctors, then prescriptions, sequentially. It does not preload hidden widget trees, history, other document categories, PDFs, attachments or audio. Backgrounding, connectivity loss, account changes and memory pressure stop subsequent speculative work. Memory pressure drops datasets without deleting the booking draft.

Appointments and Documents build on demand. Their selected tabs/layouts, booking draft and keyed scroll positions survive tab changes using session state and PageStorage. Logout clears this memory. Fresh datasets are reused without showing a loading spinner. Other document categories and appointment history load when selected; pull-to-refresh forces a server read.

Queue polling runs every 30 seconds only while foregrounded and online. Resume/reconnect refresh immediately. Concurrent refresh triggers share a request and coalesce into one follow-up; unchanged tickets do not rebuild the portal. Queue-turn notifications retain their waiting-to-consultation transition check. Slot event bursts are debounced and invalidate an open booking review immediately.

Document lists and both variable-height grids build cards lazily. Grid columns keep the previous round-robin assignment, spacing and natural heights. Theme save-status changes update the settings drawer separately from app-wide appearance changes. Identical theme refreshes avoid redundant cache writes. Cached appearance restoration remains before navigation, while nonessential theme persistence runs afterward.

PDF responses stream through the shared HTTP client to a `.part` file. Only complete files are renamed and opened; failed partial files are deleted. Emergency contacts reuse their loading future until the profile cache changes. Inactivity tracking updates a deadline instead of allocating a new timer for each pointer movement.

## Automated checks

From `mobile/`:

```powershell
flutter analyze --no-pub
flutter test --no-pub
flutter test --no-pub test/mobile_performance_test.dart
```

The performance regression suite covers cache reuse/expiry/invalidation, request sharing, session changes, memory pressure, consent-gated sequential preloading, theme notifications, interrupted downloads, tab data/draft reuse, queue lifecycle and burst handling. It compares the old and lazy grid rendering pixel-for-pixel for two and three columns, and verifies that a 1,000-card grid builds only a visible subset. Existing appearance and booking suites cover palettes, contrast, text scaling, review dismissal and booking races.

## Android profiling protocol

Use the same physical Android device, server, dataset and build mode for before/after comparison. Debug-mode timings and widget-test timings are not launch benchmarks.

1. Run `flutter devices`, then `flutter run --profile -d <android-device-id>`. Use Flutter DevTools Performance and Memory views. Use a release build when collecting end-user cold-launch timings.
2. Collect at least ten force-stopped launches with a valid saved session, then repeat with no session, an expired session and an unreachable API. Record first Flutter frame separately from the validated, usable portal. Keep the existing four-second saved-session validation timeout.
3. Record first and repeat Appointments/Documents transitions, request counts and frame timings. Verify fresh return visits do not refetch doctors/documents/history; availability still refreshes.
4. With realistic and large histories, scroll list/grid views and switch tabs 20 times. Compare settled Dart heap, external memory, raster-cache use and frame timings after garbage collection. Check for sustained growth instead of relying on a single peak.
5. Exercise background/resume, offline/reconnect, account switching, consent revocation, queue-turn notifications and responder alarms. Compare screenshots at phone/tablet widths and 200% text scaling in every appearance.

No physical Android timing or memory result is claimed by the automated regression tests. Without a connected Android device/emulator, record this profiling step as unavailable.
