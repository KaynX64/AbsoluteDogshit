# MB-06 · login_screen.dart

Mobile screens slice map · [index](../CODESLICE.md) · working tree · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-06 · mobile/lib/screens/login_screen.dart
**LOC:** 485 · **Role:** Seeded-account password and PSU Google sign-in, secure session persistence and role routing
**Mounted by:** splash_screen.dart when no stored session remains, logout paths of both role screens, the session timeout listener, and ChangePasswordScreen
**API surface:** POST /api/auth/mobile/synthetics (seeded credentials), POST /api/auth/mobile/google (Google ID token)
**Realtime:** starts the authenticated alert session after sign-in
**State / key fields:** Password form, text controllers, active sign-in method, secure storage, password visibility and sign-in errors

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-18 | — | Imports for material_ui, secure storage, HTTP, and sign-in services |
| 2 | 19-44 | class LoginScreen | Endpoint and session methods, sign-in dependencies and optional notice |
| 3 | 45-74 | void _submitPassword | Controllers, sign-in state and password validation before submission |
| 4 | 75-134 | api/auth/mobile | Get Google credentials when selected, submit credentials with a timeout and validate the response. |
| 5 | 135-187 | EMERGENCY_RESPONDER | Persist and route a valid session. Give specific feedback for rejected sign-in and connection failures. |
| 6 | 188-236 | _pillInputDecoration | Controller cleanup, shared input decoration and sign-in progress |
| 7 | 237-290 | HEALTHLINK | Scaffold, tablet width cap and brand row |
| 8 | 291-302 | widget.sessionNotice | Sign-in notice after password change or session expiry |
| 9 | 303-322 | Welcome back. | Headline and available sign-in options |
| 10 | 323-397 | Form( | Email and password controls and primary sign-in button |
| 11 | 398-438 | Sign in with Google | Secondary Google sign-in button with the bundled Google logo |
| 12 | 439-485 | Error banner | Sign-in error and infirmary contact guidance |
