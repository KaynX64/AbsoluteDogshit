# MB-06 · login_screen.dart

Mobile screens slice map · [index](../CODESLICE.md) · working tree · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-06 · mobile/lib/screens/login_screen.dart
**LOC:** 495 · **Role:** Login form: POST /api/auth/login, persists jwt_token + user_data, routes EMERGENCY_RESPONDER to ResponderScreen else PatientPortalScreen
**Mounted by:** splash_screen.dart (L117, no stored session); logout paths of both role screens, the session timeout listener, and ChangePasswordScreen
**API surface:** POST /api/auth/login (email/password)
**Realtime:** starts the authenticated alert session after sign-in
**State / key fields:** _emailController/_passwordController (L28-29), _storage (L30), _isLoading (L32), _obscurePassword (L33), _rememberMe (L34), _errorMessage (L35), palette consts (L38-40)

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-17 | — | Imports and dependencies |
| 2 | 18-26 | LoginScreen | LoginScreen StatefulWidget with optional session notice |
| 3 | 27-41 | _emailController | Controllers, secure storage, loading/obscure/remember flags, _errorMessage |
| 4 | 42-81 | api/auth/login | POST with response timeout, session storage and alert startup |
| 5 | 82-117 | EMERGENCY_RESPONDER | Role routing and sign-in error messages for network, TLS and invalid responses |
| 6 | 118-155 | _pillInputDecoration | Dispose controllers and define the pill-style InputDecoration |
| 7 | 156-207 | HEALTHLINK | Scaffold, tablet width cap and brand row |
| 8 | 208-226 | widget.sessionNotice | Accessible sign-in notice after password change or session expiry |
| 9 | 227-247 | Welcome back. | Headline and sign-in introduction |
| 10 | 248-280 | University email | University email field |
| 11 | 281-321 | Enter your password | Password field with visibility toggle |
| 12 | 322-375 | Forgot password? | Remember me and password reset guidance |
| 13 | 376-410 | Tip: Ensure | Error banner and PSU infirmary account tip |
| 14 | 411-459 | Sign in to portal | Submit button and loading spinner |
| 15 | 460-495 | A little care goes a long way. | Community footer and closing layout |
