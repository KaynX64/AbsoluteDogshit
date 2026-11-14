# MB-06 · login_screen.dart

Mobile screens slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-06 · mobile/lib/screens/login_screen.dart
**LOC:** 431 · **Anchor verification:** current account-theme working tree · **Role:** Login form: POST /api/auth/login, persists jwt_token + user_data, routes EMERGENCY_RESPONDER to ResponderScreen else PatientPortalScreen
**Mounted by:** splash_screen.dart (L117, no stored session); logout paths of patient_portal_screen (L350/L410/L769), responder_screen, session_timeout_listener
**API surface:** POST /api/auth/login (L43, email/password)
**Socket events:** none (calls EmergencyAlertService().syncFcmTokenWithBackend() to register FCM push after login)
**State / key fields:** _emailController/_passwordController (L21-22), _storage (L23), _isLoading (L25), _obscurePassword (L26), _rememberMe (L27), _errorMessage (L28), palette consts (L31-33)

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-13 | — | imports: dart:convert, http, secure storage, ApiConfig, ValetudoLogo, portal/responder screens, service |
| 2 | 14-20 | LoginScreen | LoginScreen StatefulWidget (no params) |
| 3 | 21-35 | _emailController | state: email/password controllers, secure storage, loading/obscure/remember flags, _errorMessage |
| 4 | 36-67 | api/auth/login | _handleLogin: POST /api/auth/login; on 200 stores jwt_token + user_data; syncs FCM token with backend |
| 5 | 68-96 | EMERGENCY_RESPONDER | role routing: EMERGENCY_RESPONDER → ResponderScreen, else PatientPortalScreen; error + catch paths |
| 6 | 97-134 | _pillInputDecoration | dispose controllers; _pillInputDecoration pill-style InputDecoration with optional suffixIcon |
| 7 | 135-188 | HEALTHLINK | build(): Scaffold, tablet width cap, brand row ValetudoLogo + 'valetudo.' / 'HEALTHLINK' |
| 8 | 189-219 | Welcome back. | headline block: 'YOUR CAMPUS CARE, CONNECTED', 'Welcome back.', patient-portal subtext |
| 9 | 220-243 | University email | University email TextFormField, emailAddress keyboard, 'you@psu.edu.ph' hint |
| 10 | 244-278 | Enter your password | Password TextFormField (obscured) with visibility toggle suffix IconButton |
| 11 | 279-323 | Forgot password? | Remember me checkbox + 'Forgot password?' TextButton (onPressed no-op) |
| 12 | 324-358 | Tip: Ensure | conditional error banner: _errorMessage container + PSU infirmary account tip text |
| 13 | 359-397 | Sign in to portal | submit button 'Sign in to portal' → _handleLogin; spinner while _isLoading |
| 14 | 398-431 | A little care goes a long way. | community footer row 'A little care goes a long way.' + column/scaffold close |
