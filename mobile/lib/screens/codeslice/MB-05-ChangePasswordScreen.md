# MB-05 · change_password_screen.dart

Mobile screens slice map · [index](../CODESLICE.md) · check from repo root: `python scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-05 · mobile/lib/screens/change_password_screen.dart
**LOC:** 481 · **Anchor verification:** current working tree · **Role:** Change password with field-specific recovery and a sign-in handoff.
**Mounted by:** shared Account settings and the patient Profile shortcut.
**API surface:** PUT /api/auth/change-password with currentPassword, newPassword and optional fcm_token.
**State / key fields:** field keys, focus nodes, controllers, submission state, and persistent error and sign-in messages.

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-12 | — | Imports for Flutter, HTTP, secure storage, and account services |
| 2 | 13-22 | ChangePasswordScreen | Screen constructor and optional fixture dependencies |
| 3 | 23-56 | _formKey | Form state and lifecycle of the focus nodes and controllers |
| 4 | 57-73 | _validateNewPassword | Required value, outer whitespace, length and character groups |
| 5 | 74-82 | _focusField | Focuses and scrolls the relevant input into view |
| 6 | 83-172 | _submit | Validates, submits the update, and maps HTTP outcomes |
| 7 | 173-212 | _showValidationError | Maps server messages to fields and reports unconfirmed outcomes |
| 8 | 213-246 | _returnToSignIn | Clears the local session, preserves the theme cache and opens sign-in |
| 9 | 247-287 | PopScope | Themed page, scrollable form and autofill group |
| 10 | 288-308 | Current password | Current password field and field-specific server error |
| 11 | 309-332 | Use at least 8 characters | New password field and visible composition guidance |
| 12 | 333-355 | Confirm new password | Confirmation field and match validation |
| 13 | 356-395 | FilledButton | Persistent submission messages and submit or cleanup retry |
| 14 | 396-426 | _PasswordInput | Shared password field inputs |
| 15 | 427-481 | obscureText | Per-field visibility, autofill, accessible errors and input actions |
