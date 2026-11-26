# MB-06 · login_screen.dart

Mobile screens slice map · [index](../CODESLICE.md) · working tree · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-06 · mobile/lib/screens/login_screen.dart
**LOC:** 447 · **Role:** Mobile Google and development demo sign-in, secure session persistence and role routing
**Mounted by:** splash_screen.dart when no stored session remains, logout paths of both role screens, the session timeout listener, and ChangePasswordScreen
**API surface:** POST /api/auth/mobile/google (Google ID token), POST /api/auth/mobile/demo (seeded credentials)
**Realtime:** starts the authenticated alert session after sign-in
**State / key fields:** Demo text controllers, secure storage, loading and password visibility flags, and sign-in errors

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-18 | — | Imports for material_ui, secure storage, HTTP, and sign-in services |
| 2 | 19-27 | LoginScreen | LoginScreen StatefulWidget with optional session notice |
| 3 | 28-41 | _emailController | Controllers, secure storage, and sign-in flags |
| 4 | 42-89 | api/auth/mobile | Google token or demo credentials, response timeout and session storage |
| 5 | 90-122 | EMERGENCY_RESPONDER | Role routing and sign-in errors |
| 6 | 123-160 | _pillInputDecoration | Controller cleanup and demo InputDecoration |
| 7 | 161-212 | HEALTHLINK | Scaffold, tablet width cap and brand row |
| 8 | 213-225 | widget.sessionNotice | Sign-in notice after password change or session expiry |
| 9 | 226-254 | Welcome back. | Headline and PSU Google sign-in introduction |
| 10 | 255-324 | Demo email | Debug-only seeded account fields and submit button |
| 11 | 325-360 | Error banner | Sign-in error and infirmary contact guidance |
| 12 | 361-413 | Sign in with Google | Google sign-in button and loading spinner |
| 13 | 414-447 | A little care goes a long way. | Community footer and closing layout |
