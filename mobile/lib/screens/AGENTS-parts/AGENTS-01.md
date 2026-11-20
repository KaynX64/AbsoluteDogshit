<!-- split from mobile/lib/screens/AGENTS.md — part 01 of 02 -->
# mobile/lib/screens/AGENTS.md — screen map & navigation anchors

Stateful screens use a public `XxxScreen` widget and a private `_XxxScreenState`. Re-locate symbols with `rg -n`.

Start with the [code-slice index](../CODESLICE.md) when navigating the patient portal, scheduler, document viewer or SOS service. Use its verified ranges for targeted reads.

## Shared screen conventions

- Token: `final _storage = const FlutterSecureStorage();` → `await _storage.read(key: 'jwt_token')`. Keys: `jwt_token`, `user_data` (written by `_handleLogin`).
- HTTP: `ApiConfig.client` / `http.post` + `Uri.parse('${ApiConfig.baseUrl}/api/...')`, header `{'Authorization': 'Bearer $token'}`, `if (!mounted) return;` after every await. `ApiConfig.baseUrl` is the single host definition (`lib/config/api_config.dart`) — screens must not hardcode hosts.
- Screen-owned sockets use `ApiConfig.socketUrl` with the JWT in `auth` and disconnect in `dispose()`. The authenticated alert service owns its own socket.
- UI style: `_pillInputDecoration()` — each screen defines its own copy (dedupe candidate, but keep visual parity when touching one). Toasts via `SnackBar`.
- Role routing: login sends `EMERGENCY_RESPONDER` → `ResponderScreen`, everyone else → `PatientPortalScreen`; splash re-validates the saved session and routes the same way through `_routeUser`.
- After any await before `setState`/`Navigator`: keep the `mounted` guard — silent background failures in Flutter throw otherwise.
- Server enforces RBAC/consent; any role gating in screens is UX only.
- Appearance comes from `AccountThemeScope` above the navigator and the context-derived `AppPalette`. Screen color getters must stay reactive. Preserve semantic emergency actions and QR contrast. Both role headers use the shared `AccountSettingsButton` gear. See [account appearance guidance](../../../AGENTS.md#account-appearance-and-settings).

## Screens

### patient_portal_screen.dart — patient hub

- [Slice map](../CODESLICE.md#quick-index) (MB-01). The five destinations are Overview, Appointments, SOS, Documents and Profile.
- Consent uses `_checkPrivacyConsent`, `_recordConsent` and `_revokeConsent`. The portal raises the required consent modal on startup when consent is missing.
- `_initQueueSocket` calls `_fetchActiveQueueTicket` on `queue:updated`. The same fetch runs on a 30-second foreground/online poll. Overlapping triggers share a request and queue one follow-up; resume/reconnect refresh immediately, and unchanged tickets do not rebuild. `_fetchQRPass` loads the dynamic health pass and `_fetchProfile` loads profile data and caches emergency information.
- `services/mobile_session_data.dart` owns session-only datasets, tab drafts and PageStorage. Auth session start/end binds/clears it; screens guard late results with its generation. See [performance behavior](../../../PERFORMANCE.md) for freshness and preloading.
- The Overview's dark `YOUR HEALTH AT A GLANCE` card keeps its heading, heart and menu icons white in both modes. Use the card's own foreground colors.
- `_startHold` checks `_sosConsent` before starting the hold timer. `_triggerEmergencySOS` submits the location online or queues the SOS and opens the dialer offline. `_onConnectivityChanged` triggers `_replayQueuedSosEvents` on reconnection.
- The health pass and profile cards display the live Qualified Responder badge when applicable, with a Responder Hub entry for eligible accounts. `ActiveIncidentBanner` below the header opens the shared incident detail.
- `_handleSignOut` confirms manual sign-out before the shared alert session releases the installation or legacy FCM token. `_signOut` clears the JWT and saved user data.
