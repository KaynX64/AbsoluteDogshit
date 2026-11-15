# MB-06 · login_screen.dart

Mobile screens slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-06 · mobile/lib/screens/login_screen.dart
**LOC:** 456 · **Anchor verification:** current account-theme working tree · **Role:** Login form: POST /api/auth/login, persists jwt_token + user_data, routes EMERGENCY_RESPONDER to ResponderScreen else PatientPortalScreen
**Mounted by:** splash_screen.dart (L117, no stored session); logout paths of both role screens, the session timeout listener, and ChangePasswordScreen
**API surface:** POST /api/auth/login (email/password)
**Socket events:** none (calls EmergencyAlertService().syncFcmTokenWithBackend() to register FCM push after login)
**State / key fields:** _emailController/_passwordController (L21-22), _storage (L23), _isLoading (L25), _obscurePassword (L26), _rememberMe (L27), _errorMessage (L28), palette consts (L31-33)

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-13 | — | imports: dart:convert, http, secure storage, ApiConfig, ValetudoLogo, portal/responder screens, service |
| 2 | 14-22 | LoginScreen | LoginScreen StatefulWidget with optional session notice |
| 3 | 23-37 | _emailController | state: email/password controllers, secure storage, loading/obscure/remember flags, _errorMessage |
| 4 | 38-69 | api/auth/login | _handleLogin: POST /api/auth/login; on 200 stores jwt_token + user_data; syncs FCM token with backend |
| 5 | 70-98 | EMERGENCY_RESPONDER | role routing: EMERGENCY_RESPONDER → ResponderScreen, else PatientPortalScreen; error + catch paths |
| 6 | 99-136 | _pillInputDecoration | dispose controllers; _pillInputDecoration pill-style InputDecoration with optional suffixIcon |
| 7 | 137-188 | HEALTHLINK | build(): Scaffold, tablet width cap, brand row ValetudoLogo + 'LeoVital' / 'HEALTHLINK' |
| 8 | 189-200 | widget.sessionNotice | Accessible sign-in notice near the top after password change or session expiry |
| 9 | 201-231 | Welcome back. | Headline and sign-in introduction |
| 10 | 232-255 | University email | University email TextFormField, emailAddress keyboard, 'you@psu.edu.ph' hint |
| 11 | 256-290 | Enter your password | Password TextFormField (obscured) with visibility toggle suffix IconButton |
| 12 | 291-340 | Forgot password? | Remember me checkbox + 'Forgot password?' TextButton (onPressed no-op) |
| 13 | 341-376 | Tip: Ensure | conditional error banner: _errorMessage container + PSU infirmary account tip text |
| 14 | 377-422 | Sign in to portal | submit button 'Sign in to portal' → _handleLogin; spinner while _isLoading |
| 15 | 423-456 | A little care goes a long way. | community footer row 'A little care goes a long way.' + column/scaffold close |
