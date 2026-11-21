# MB-06 · login_screen.dart

Mobile screens slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-06 · mobile/lib/screens/login_screen.dart
**LOC:** 482 · **Anchor verification:** Android responder revamp · **Role:** Login form: POST /api/auth/login, persists jwt_token + user_data, routes EMERGENCY_RESPONDER to ResponderScreen else PatientPortalScreen
**Mounted by:** splash_screen.dart (L117, no stored session); logout paths of both role screens, the session timeout listener, and ChangePasswordScreen
**API surface:** POST /api/auth/login (email/password)
**Realtime:** starts the authenticated alert session after sign-in
**State / key fields:** _emailController/_passwordController (L21-22), _storage (L23), _isLoading (L25), _obscurePassword (L26), _rememberMe (L27), _errorMessage (L28), palette consts (L31-33)

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-14 | — | imports: dart:convert, http, secure storage, ApiConfig, ValetudoLogo, portal/responder screens, service |
| 2 | 15-23 | LoginScreen | LoginScreen StatefulWidget with optional session notice |
| 3 | 24-38 | _emailController | state: email/password controllers, secure storage, loading/obscure/remember flags, _errorMessage |
| 4 | 39-68 | api/auth/login | _handleLogin: POST /api/auth/login; on 200 stores jwt_token + user_data; starts the alert session without waiting for FCM |
| 5 | 69-104 | EMERGENCY_RESPONDER | role routing: EMERGENCY_RESPONDER → ResponderScreen, else PatientPortalScreen; error + catch paths |
| 6 | 105-142 | _pillInputDecoration | dispose controllers; _pillInputDecoration pill-style InputDecoration with optional suffixIcon |
| 7 | 143-194 | HEALTHLINK | build(): Scaffold, tablet width cap, brand row ValetudoLogo + 'LeoVital' / 'HEALTHLINK' |
| 8 | 195-206 | widget.sessionNotice | Accessible sign-in notice near the top after password change or session expiry |
| 9 | 207-237 | Welcome back. | Headline and sign-in introduction |
| 10 | 238-261 | University email | University email TextFormField, emailAddress keyboard, 'you@psu.edu.ph' hint |
| 11 | 262-297 | Enter your password | Password TextFormField (obscured) with visibility toggle suffix IconButton |
| 12 | 298-361 | Forgot password? | Remember me and password reset guidance directing the user to the clinic administrator |
| 13 | 362-397 | Tip: Ensure | conditional error banner: _errorMessage container + PSU infirmary account tip text |
| 14 | 398-448 | Sign in to portal | submit button 'Sign in to portal' → _handleLogin; spinner while _isLoading |
| 15 | 449-482 | A little care goes a long way. | community footer row 'A little care goes a long way.' + column/scaffold close |
