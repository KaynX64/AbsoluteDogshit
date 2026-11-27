# MB-05 · change_password_screen.dart

Mobile screens slice map · [index](../CODESLICE.md) · check from repo root: `python scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-05 · mobile/lib/screens/change_password_screen.dart
**LOC:** 496 · **Anchor commit:** working tree · **Role:** Change password with field-specific recovery and a sign-in handoff.
**Mounted by:** shared Account settings and the patient Profile shortcut.
**API surface:** PUT /api/auth/change-password with currentPassword, newPassword and optional fcm_token.
**State / key fields:** field keys, focus nodes, controllers, submission state, and persistent error and sign-in messages.

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-13 | — | Imports for material_ui, HTTP, secure storage, and account services |
| 2 | 14-23 | ChangePasswordScreen | Screen constructor and optional fixture dependencies |
| 3 | 24-57 | _formKey | Form state and lifecycle of the focus nodes and controllers |
| 4 | 58-74 | _validateNewPassword | Required value, outer whitespace, length and character groups |
| 5 | 75-83 | _focusField | Focuses and scrolls the relevant input into view |
| 6 | 84-187 | _submit | Validates, submits the update, and maps HTTP and transport failures |
| 7 | 188-228 | _showValidationError | Maps server messages to fields and gives recovery guidance when an update cannot be confirmed |
| 8 | 229-261 | _returnToSignIn | Clears the local session, preserves the theme cache and opens sign-in |
| 9 | 262-302 | PopScope | Themed page, scrollable form and autofill group |
| 10 | 303-323 | Current password | Current password field and field-specific server error |
| 11 | 324-347 | Use at least 8 characters | New password field and visible composition guidance |
| 12 | 348-370 | Confirm new password | Confirmation field and match validation |
| 13 | 371-410 | FilledButton | Persistent submission messages and submit or cleanup retry |
| 14 | 411-441 | _PasswordInput | Shared password field inputs |
| 15 | 442-496 | obscureText | Per-field visibility, autofill, accessible errors and input actions |
