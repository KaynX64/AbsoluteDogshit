# MB-06 · login_screen.dart

Mobile screens slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-06 · mobile/lib/screens/login_screen.dart
**LOC:** 425 · **Anchor commit:** 8fcbdc7 · **Role:** Login form: POST /api/auth/login, persists jwt_token + user_data, routes EMERGENCY_RESPONDER to ResponderScreen else PatientPortalScreen
**Mounted by:** splash_screen.dart (L117, no stored session); logout paths of patient_portal_screen (L350/L410/L769), responder_screen (L269), session_timeout_listener (L125)
**API surface:** POST /api/auth/login (L43, email/password)
**Socket events:** none (calls EmergencyAlertService().syncFcmTokenWithBackend() L60 to register FCM push after login)
**State / key fields:** _emailController/_passwordController (L21-22), _storage (L23), _isLoading (L25), _obscurePassword (L26), _rememberMe (L27), _errorMessage (L28), palette consts (L31-33)

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-12 | — | imports: dart:convert, http, secure storage, ApiConfig, ValetudoLogo, portal/responder screens, service |
| 2 | 13-19 | LoginScreen | LoginScreen StatefulWidget (no params) |
| 3 | 20-34 | _emailController | state: email/password controllers, secure storage, loading/obscure/remember flags, _errorMessage |
| 4 | 35-62 | api/auth/login | _handleLogin: POST /api/auth/login; on 200 stores jwt_token + user_data; syncs FCM token with backend |
| 5 | 63-91 | EMERGENCY_RESPONDER | role routing: EMERGENCY_RESPONDER → ResponderScreen, else PatientPortalScreen; error + catch paths |
| 6 | 92-129 | _pillInputDecoration | dispose controllers; _pillInputDecoration pill-style InputDecoration with optional suffixIcon |
| 7 | 130-183 | HEALTHLINK | build(): Scaffold, tablet width cap, brand row ValetudoLogo + 'valetudo.' / 'HEALTHLINK' |
| 8 | 184-214 | Welcome back. | headline block: 'YOUR CAMPUS CARE, CONNECTED', 'Welcome back.', patient-portal subtext |
| 9 | 215-238 | University email | University email TextFormField, emailAddress keyboard, 'you@psu.edu.ph' hint |
| 10 | 239-273 | Enter your password | Password TextFormField (obscured) with visibility toggle suffix IconButton |
| 11 | 274-318 | Forgot password? | Remember me checkbox + 'Forgot password?' TextButton (onPressed no-op) |
| 12 | 319-353 | Tip: Ensure | conditional error banner: _errorMessage container + PSU infirmary account tip text |
| 13 | 354-392 | Sign in to portal | submit button 'Sign in to portal' → _handleLogin; spinner while _isLoading |
| 14 | 393-426 | A little care goes a long way. | community footer row 'A little care goes a long way.' + column/scaffold close |
