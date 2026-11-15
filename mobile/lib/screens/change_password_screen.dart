import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import '../config/api_config.dart';
import '../services/emergency_alert_service.dart';
import '../theme/account_theme_controller.dart';
import 'login_screen.dart';

class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key, this.client, this.deviceToken});

  final http.Client? client;
  final Future<String?> Function()? deviceToken;

  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  static const _storage = FlutterSecureStorage();
  static const _shortPasswordRule =
      'Use at least 3 types: uppercase letters, lowercase letters, numbers, or symbols.';

  final _formKey = GlobalKey<FormState>();
  final _currentField = GlobalKey<FormFieldState<String>>();
  final _newField = GlobalKey<FormFieldState<String>>();
  final _confirmField = GlobalKey<FormFieldState<String>>();
  final _currentFocus = FocusNode();
  final _newFocus = FocusNode();
  final _confirmFocus = FocusNode();
  final _currentPassword = TextEditingController();
  final _newPassword = TextEditingController();
  final _confirmPassword = TextEditingController();

  bool _submitted = false;
  bool _saving = false;
  String? _currentError;
  String? _newError;
  String? _message;
  String? _signInNotice;

  @override
  void dispose() {
    _currentFocus.dispose();
    _newFocus.dispose();
    _confirmFocus.dispose();
    _currentPassword.dispose();
    _newPassword.dispose();
    _confirmPassword.dispose();
    super.dispose();
  }

  String? _validateNewPassword(String? value) {
    final password = value ?? '';
    if (password.isEmpty) return 'Enter your new password.';
    if (password != password.trim()) {
      return 'Remove spaces at the beginning or end of your password.';
    }
    if (password.length < 8) return 'Use at least 8 characters.';
    if (password.length >= 12) return null;
    final groups = [
      RegExp(r'[A-Z]'),
      RegExp(r'[a-z]'),
      RegExp(r'[0-9]'),
      RegExp(r'[^A-Za-z0-9]'),
    ].where((group) => group.hasMatch(password)).length;
    return groups < 3 ? _shortPasswordRule : null;
  }

  void _focusField(GlobalKey<FormFieldState<String>> field, FocusNode focus) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final fieldContext = field.currentContext;
      if (!mounted || fieldContext == null) return;
      focus.requestFocus();
      Scrollable.ensureVisible(fieldContext, alignment: 0.15);
    });
  }

  Future<void> _submit() async {
    if (_saving || _signInNotice != null) return;
    setState(() {
      _submitted = true;
      _message = null;
    });
    if (!_formKey.currentState!.validate()) {
      for (final (field, focus) in [
        (_currentField, _currentFocus),
        (_newField, _newFocus),
        (_confirmField, _confirmFocus),
      ]) {
        if (field.currentState!.hasError) {
          _focusField(field, focus);
          break;
        }
      }
      return;
    }

    FocusScope.of(context).unfocus();
    final currentPassword = _currentPassword.text.trim();
    final newPassword = _newPassword.text;
    setState(() => _saving = true);
    try {
      final token = await _storage.read(key: 'jwt_token');
      if (!mounted) return;
      if (token == null || token.isEmpty) {
        await _returnToSignIn(
          'Your session ended. Sign in to change your password.',
        );
        return;
      }

      String? deviceToken;
      try {
        deviceToken =
            await (widget.deviceToken ??
                    EmergencyAlertService().currentFcmToken)()
                .timeout(const Duration(seconds: 2));
      } catch (_) {
        // Push registration may be unavailable on this device.
      }
      if (!mounted) return;
      final response = await (widget.client ?? ApiConfig.client)
          .put(
            Uri.parse('${ApiConfig.baseUrl}/api/auth/change-password'),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer $token',
            },
            body: jsonEncode({
              'currentPassword': currentPassword,
              'newPassword': newPassword,
              if (deviceToken != null && deviceToken.isNotEmpty)
                'fcm_token': deviceToken,
            }),
          )
          .timeout(const Duration(seconds: 15));
      if (!mounted) return;
      switch (response.statusCode) {
        case 200:
          TextInput.finishAutofillContext();
          await _returnToSignIn(
            'Password changed. Sign in with your new password.',
          );
        case 401 || 403:
          await _returnToSignIn(
            'Your session ended. Sign in to change your password.',
          );
        case 400:
          _showValidationError(response.body);
        case 409:
          setState(
            () => _message = 'Your account changed elsewhere. Check your current password and try again.',
          );
        case 429:
          setState(
            () => _message = 'Too many attempts. Wait a moment and try again.',
          );
        default:
          _showUnconfirmed();
      }
    } catch (_) {
      if (mounted) _showUnconfirmed();
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _showValidationError(String body) {
    final data = jsonDecode(body);
    if (data is! Map<String, dynamic>) {
      _showUnconfirmed();
      return;
    }
    final error = data['error'];
    if (error == 'Incorrect current password.') {
      setState(() => _currentError = 'Current password is incorrect.');
      _focusField(_currentField, _currentFocus);
    } else if (data['code'] == 'WEAK_PASSWORD' ||
        error == 'New password must be different from your current password.') {
      final issues = data['issues'];
      final feedback = issues is List
          ? issues.whereType<String>().join(' ')
          : '';
      setState(() {
        _newError = feedback.isNotEmpty
            ? feedback
            : data['code'] == 'WEAK_PASSWORD'
            ? 'Choose a password that meets the requirements.'
            : 'Choose a password different from your current password.';
      });
      _focusField(_newField, _newFocus);
    } else {
      setState(
        () => _message =
            'Could not update your password. Check your entries and try again.',
      );
    }
  }

  void _showUnconfirmed() {
    setState(() {
      _message =
          'We couldn’t confirm the change. If your current password no '
          'longer works, try signing in with the new one.';
    });
  }

  Future<void> _returnToSignIn(String notice) async {
    setState(() {
      _signInNotice = notice;
      _message = null;
      _saving = true;
    });
    _currentPassword.clear();
    _newPassword.clear();
    _confirmPassword.clear();
    final themes = AccountThemeScope.of(context);
    final alerts = EmergencyAlertService();
    if (alerts.isResponderActive) alerts.stopResponderListener();
    themes.reset();

    try {
      await _storage.delete(key: 'jwt_token');
      await _storage.delete(key: 'user_data');
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute<void>(
          builder: (_) => LoginScreen(sessionNotice: notice),
        ),
        (route) => false,
      );
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _message = 'Could not clear this device’s session. Retry to continue to sign-in.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final notice = _signInNotice;
    final message = _message;
    final actionLabel = switch ((notice != null, _saving)) {
      (true, true) => 'Signing out…',
      (true, false) => 'Retry sign-in',
      (false, true) => 'Updating password…',
      (false, false) => 'Update password',
    };
    return PopScope(
      canPop: !_saving && notice == null,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Change password'),
          toolbarHeight: MediaQuery.textScalerOf(context)
              .scale(kToolbarHeight)
              .clamp(kToolbarHeight, 112.0),
          automaticallyImplyLeading: !_saving && notice == null,
        ),
        body: SafeArea(
          child: Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: AutofillGroup(
                onDisposeAction: AutofillContextAction.cancel,
                child: Form(
                  key: _formKey,
                  autovalidateMode: _submitted
                      ? AutovalidateMode.onUserInteraction
                      : AutovalidateMode.disabled,
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (notice == null) ...[
                          const Text(
                            'You’ll sign in again after changing your password.',
                          ),
                          const SizedBox(height: 20),
                          _PasswordInput(
                            fieldKey: _currentField,
                            controller: _currentPassword,
                            focus: _currentFocus,
                            nextFocus: _newFocus,
                            label: 'Current password',
                            autofillHint: AutofillHints.password,
                            readOnly: _saving,
                            error: _currentError,
                            validator: (value) =>
                                value == null || value.trim().isEmpty
                                ? 'Enter your current password.'
                                : null,
                            onChanged: (_) {
                              if (_currentError != null) {
                                setState(() => _currentError = null);
                              }
                            },
                          ),
                          const SizedBox(height: 20),
                          _PasswordInput(
                            fieldKey: _newField,
                            controller: _newPassword,
                            focus: _newFocus,
                            nextFocus: _confirmFocus,
                            label: 'New password',
                            autofillHint: AutofillHints.newPassword,
                            readOnly: _saving,
                            error: _newError,
                            validator: _validateNewPassword,
                            onChanged: (_) {
                              if (_newError != null) {
                                setState(() => _newError = null);
                              }
                            },
                          ),
                          const Padding(
                            padding: EdgeInsets.fromLTRB(4, 8, 4, 20),
                            child: Text(
                              'Use at least 8 characters. For 8–11 characters, mix at '
                              'least 3 types: uppercase letters, lowercase letters, '
                              'numbers, or symbols.',
                            ),
                          ),
                          _PasswordInput(
                            fieldKey: _confirmField,
                            controller: _confirmPassword,
                            focus: _confirmFocus,
                            label: 'Confirm new password',
                            autofillHint: AutofillHints.newPassword,
                            readOnly: _saving,
                            validator: (value) {
                              if (value == null || value.isEmpty) {
                                return 'Confirm your new password.';
                              }
                              return value == _newPassword.text
                                  ? null
                                  : 'The new passwords do not match.';
                            },
                            onSubmitted: _submit,
                          ),
                        ] else
                          Semantics(liveRegion: true, child: Text(notice)),
                        const SizedBox(height: 16),
                        if (message != null) ...[
                          Semantics(
                            liveRegion: true,
                            child: Text(
                              message,
                              style: TextStyle(color: scheme.error),
                            ),
                          ),
                          const SizedBox(height: 12),
                        ],
                        FilledButton(
                          style: FilledButton.styleFrom(
                            minimumSize: const Size(48, 48),
                          ),
                          onPressed: _saving
                              ? null
                              : notice == null
                              ? _submit
                              : () => _returnToSignIn(notice),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            child: Semantics(
                              liveRegion: true,
                              child: Text(
                                actionLabel,
                                textAlign: TextAlign.center,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PasswordInput extends StatefulWidget {
  const _PasswordInput({
    required this.fieldKey,
    required this.controller,
    required this.focus,
    required this.label,
    required this.autofillHint,
    required this.readOnly,
    required this.validator,
    this.nextFocus,
    this.error,
    this.onChanged,
    this.onSubmitted,
  });

  final GlobalKey<FormFieldState<String>> fieldKey;
  final TextEditingController controller;
  final FocusNode focus;
  final FocusNode? nextFocus;
  final String label;
  final String autofillHint;
  final bool readOnly;
  final FormFieldValidator<String> validator;
  final String? error;
  final ValueChanged<String>? onChanged;
  final VoidCallback? onSubmitted;

  @override
  State<_PasswordInput> createState() => _PasswordInputState();
}

class _PasswordInputState extends State<_PasswordInput> {
  bool _obscured = true;

  @override
  Widget build(BuildContext context) {
    final label = widget.label.toLowerCase();
    return TextFormField(
      key: widget.fieldKey,
      controller: widget.controller,
      focusNode: widget.focus,
      obscureText: _obscured,
      readOnly: widget.readOnly,
      autocorrect: false,
      enableSuggestions: false,
      autofillHints: [widget.autofillHint],
      textInputAction: widget.nextFocus != null
          ? TextInputAction.next
          : TextInputAction.done,
      onEditingComplete: widget.nextFocus?.requestFocus,
      validator: widget.validator,
      forceErrorText: widget.error,
      errorBuilder: (context, error) => Semantics(
        liveRegion: true,
        child: Text(
          error,
          style: Theme.of(context).textTheme.bodySmall
              ?.copyWith(color: Theme.of(context).colorScheme.error),
        ),
      ),
      onChanged: widget.onChanged,
      onFieldSubmitted: widget.onSubmitted == null
          ? null
          : (_) => widget.onSubmitted!(),
      decoration: InputDecoration(
        labelText: widget.label,
        floatingLabelBehavior: FloatingLabelBehavior.always,
        suffixIconConstraints: const BoxConstraints(
          minHeight: 48,
          minWidth: 48,
        ),
        suffixIcon: IconButton(
          tooltip: '${_obscured ? 'Show' : 'Hide'} $label',
          icon: Icon(
            _obscured
                ? Icons.visibility_outlined
                : Icons.visibility_off_outlined,
          ),
          onPressed: widget.readOnly
              ? null
              : () => setState(() => _obscured = !_obscured),
        ),
      ),
    );
  }
}
