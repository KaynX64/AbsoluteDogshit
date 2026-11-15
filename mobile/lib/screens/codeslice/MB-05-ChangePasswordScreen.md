# MB-05 · change_password_screen.dart

Mobile screens slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-05 · mobile/lib/screens/change_password_screen.dart
**LOC:** 608 · **Anchor verification:** current account-theme working tree · **Role:** Change-password form: client strength meter (0-4) + live policy checklist gating PUT /api/auth/change-password
**Mounted by:** patient_portal_screen.dart and responder_screen.dart, both via Navigator.push
**API surface:** PUT /api/auth/change-password (L117, body currentPassword/newPassword; server issues[] echoed on 400)
**Socket events:** none
**State / key fields:** _formKey (L17), _storage (L18), 3 password TextEditingControllers (L20-22), _obscureAll (L24), _isSaving (L25), _strengthScore/_strengthLabel (L27-28), palette consts (L30-33)

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-9 | — | imports: dart:convert, Material, secure storage, http, ApiConfig, Rs responsive |
| 2 | 10-16 | ChangePasswordScreen | ChangePasswordScreen StatefulWidget (stateless shell, no params) |
| 3 | 17-35 | _formKey | state: formKey, secure storage, current/new/confirm controllers, _obscureAll, _isSaving, strength fields |
| 4 | 36-50 | initState | initState wires _evaluateStrength listener on new-password controller; dispose cleans controllers |
| 5 | 51-87 | _evaluateStrength | _evaluateStrength: upper/lower/digit/special regexes, score 0-4, labels Very Weak..Very Strong |
| 6 | 88-102 | _getStrengthColor | _getStrengthColor: per-score color (red/amber/blue/green) for meter + label |
| 7 | 103-153 | _updatePassword | _updatePassword: validate + score>=2 gate; PUT /api/auth/change-password; joins issues[]; pop on 200 |
| 8 | 154-189 | _showError | _showError crimson SnackBar; _pillInputDecoration shared pill-style InputDecoration helper |
| 9 | 190-251 | Back to my profile | build(): Scaffold, transparent app bar 'Back to my profile', form header 'Keep your account safe.' |
| 10 | 252-275 | Current password | Current password TextFormField (obscured, non-empty validator) |
| 11 | 276-304 | New password | New password TextFormField with >=8 chars validator; hint 'At least 8 characters...' |
| 12 | 305-371 | Meets requirements | strength meter: 4 segments, 'Strength: label', Meets requirements check, embeds _PasswordRequirementsPanel |
| 13 | 372-399 | Confirm new password | Confirm new password TextFormField; validator requires match with new password |
| 14 | 400-432 | Show passwords | visibility toggle row: _obscureAll IconButton, 'Show passwords'/'Hide passwords' label |
| 15 | 433-473 | Update password | submit button 'Update password': disabled while saving or score<2; spinner while _isSaving |
| 16 | 474-537 | _PasswordRequirement | PASSWORD STRENGTH UI HELPERS banner; _PasswordRequirement check-circle + label row widget |
| 17 | 538-608 | _PasswordRequirementsPanel | _PasswordRequirementsPanel: re-checks regexes, renders 5 requirement rows (length, A-Z, a-z, 0-9, symbol) |
