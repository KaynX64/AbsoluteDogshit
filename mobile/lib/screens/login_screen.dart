// mobile/lib/screens/login_screen.dart
import 'dart:async';
import 'dart:convert';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import '../config/api_config.dart';
import '../widgets/valetudo_logo.dart';
import '../utils/responsive.dart';
import 'patient_portal_screen.dart';
import 'responder_screen.dart';
import '../services/clinic_api_errors.dart';
import '../services/emergency_alert_service.dart';
import '../services/mobile_sign_in.dart';
import '../theme/account_theme_controller.dart';

enum _SignInMethod {
  password('synthetics', 'mobile_demo'),
  google('google', 'mobile_google');

  const _SignInMethod(this.endpoint, this.sessionMethod);

  final String endpoint;
  final String sessionMethod;
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    super.key,
    this.sessionNotice,
    this.client,
    this.googleIdToken = MobileSignIn.googleIdToken,
  });

  final String? sessionNotice;
  final http.Client? client;
  final Future<String?> Function() googleIdToken;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _passwordForm = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _storage = const FlutterSecureStorage();

  _SignInMethod? _pendingMethod;
  bool _obscurePassword = true;
  String _errorMessage = '';

  // Brand palette
  static const Color primaryGreen = Color(0xFF284E3A);
  static const Color textSub = Color(0xFF5A635B);
  static const Color borderColor = Color(0xFFD6DFD5);

  void _submitPassword() {
    if (_pendingMethod != null) return;
    if (!_passwordForm.currentState!.validate()) {
      setState(() => _errorMessage = '');
      return;
    }
    _handleLogin(
      _SignInMethod.password,
      credentials: {
        'email': _emailController.text.trim(),
        'password': _passwordController.text,
      },
    );
  }

  // Exchange the selected credentials for a HealthLink session.
  Future<void> _handleLogin(
    _SignInMethod method, {
    Map<String, String>? credentials,
  }) async {
    if (_pendingMethod != null) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _pendingMethod = method;
      _errorMessage = '';
    });

    var savingSession = false;
    try {
      String? idToken;
      if (method == _SignInMethod.google) {
        try {
          idToken = await widget.googleIdToken();
        } catch (error) {
          if (mounted) {
            setState(() => _errorMessage = MobileSignIn.failureMessage(error));
          }
          return;
        }
        if (!mounted || idToken == null) return;
      }
      final res = await (widget.client ?? ApiConfig.client)
          .post(
            Uri.parse(
              '${ApiConfig.baseUrl}/api/auth/mobile/${method.endpoint}',
            ),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(credentials ?? {'idToken': idToken}),
          )
          .timeout(const Duration(seconds: 15));
      if (!mounted) return;

      if (res.statusCode != 200) {
        setState(() => _errorMessage = _rejectedSignIn(res, method));
        return;
      }

      final data = jsonDecode(res.body);
      if (data is! Map<String, dynamic> ||
          data['user'] is! Map<String, dynamic> ||
          data['token'] is! String ||
          (data['token'] as String).isEmpty ||
          data['auth_method'] != method.sessionMethod) {
        throw const FormatException('Invalid sign-in response');
      }
      final user = data['user'] as Map<String, dynamic>;
      final token = data['token'] as String;
      final roles = user['roles'];
      if (user['user_id'] is! int ||
          roles is! List ||
          roles.isEmpty ||
          !roles.every((role) => role is String)) {
        throw const FormatException('Invalid signed-in account');
      }

      user['auth_method'] = method.sessionMethod;
      savingSession = true;
      // Store the token last so an interrupted write cannot restore a partial session.
      await _storage.delete(key: 'jwt_token');
      await _storage.write(key: 'user_data', value: jsonEncode(user));
      await _storage.write(key: 'jwt_token', value: token);
      if (!mounted) return;
      await AccountThemeScope.of(context).bindAccount(user, token);

      if (!mounted) return;
      EmergencyAlertService().beginSession(token, user['user_id']);
      if (roles.contains('EMERGENCY_RESPONDER')) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => ResponderScreen(user: user)),
        );
      } else {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => PatientPortalScreen(user: user)),
        );
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _errorMessage = savingSession
              ? 'Sign-in was accepted, but the app could not set up your session on this device. Restart the app and try again.'
              : clinicFailureMessage(error, operation: 'sign in');
        });
      }
    } finally {
      if (mounted) {
        setState(() => _pendingMethod = null);
      }
    }
  }

  String _rejectedSignIn(http.Response response, _SignInMethod method) {
    final status = response.statusCode;
    if (status == 404) {
      return 'The clinic server does not offer this sign-in method (HTTP 404). Contact the clinic administrator.';
    }
    if (clinicClientError(response) case final message?) return message;
    return switch (status) {
      401 when method == _SignInMethod.password =>
        'The email or password was rejected. Check both and try again.',
      401 => 'The clinic server could not verify your Google sign-in. Try selecting your PSU account again.',
      403 => 'The clinic server denied this sign-in. Contact the clinic to check your account access.',
      503 when method == _SignInMethod.google => 'The clinic server could not complete Google sign-in (HTTP 503). Try again later or contact the clinic.',
      _ => clinicStatusMessage(status, operation: 'sign in'),
    };
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  InputDecoration _pillInputDecoration({
    required Rs rs,
    required String label,
    Widget? suffixIcon,
  }) {
    final radius = BorderRadius.circular(rs.r(22));
    return InputDecoration(
      labelText: label,
      filled: true,
      fillColor: Colors.white,
      contentPadding: EdgeInsets.symmetric(
        horizontal: rs.w(20),
        vertical: rs.h(16),
      ),
      suffixIcon: suffixIcon,
      border: OutlineInputBorder(
        borderRadius: radius,
        borderSide: const BorderSide(color: borderColor),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: radius,
        borderSide: const BorderSide(color: borderColor),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: radius,
        borderSide: const BorderSide(color: primaryGreen, width: 1.6),
      ),
    );
  }

  Widget _signInProgress(String label) {
    return SizedBox.square(
      dimension: 20,
      child: CircularProgressIndicator(
        strokeWidth: 2,
        color: primaryGreen,
        semanticsLabel: label,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final rs = Rs.of(context);

    // On tablets, keep the form column readable instead of stretching
    // edge-to-edge. On phones it fills the full width minus padding.
    final contentMaxWidth = rs.isTablet ? 460.0 : double.infinity;
    final buttonSize = Size(48, rs.h(52).clamp(48.0, 58.0));

    return Scaffold(
      backgroundColor: const Color(0xFFF7F9F6),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: contentMaxWidth),
            child: SingleChildScrollView(
              padding: EdgeInsets.symmetric(
                horizontal: rs.w(24),
                vertical: rs.h(20),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // ── Top brand tag ────────────────────────────────
                  Row(
                    children: [
                      ValetudoLogo(size: rs.w(36).clamp(30.0, 44.0)),
                      SizedBox(width: rs.w(10)),
                      Flexible(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'LeoVital',
                              style: TextStyle(
                                fontSize: rs.sp(17),
                                fontWeight: FontWeight.w900,
                                color: const Color(0xFF191C1A),
                                height: 1.1,
                              ),
                            ),
                            Text(
                              'HEALTHLINK',
                              style: TextStyle(
                                fontSize: rs.sp(8.5),
                                fontWeight: FontWeight.w700,
                                letterSpacing: 2.2,
                                color: const Color(0xFF4D6053),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  if (widget.sessionNotice case final notice?) ...[
                    const SizedBox(height: 16),
                    Semantics(
                      liveRegion: true,
                      child: Text(
                        notice,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ),
                  ],
                  SizedBox(height: rs.h(32)),

                  Text(
                    'Welcome back.',
                    style: TextStyle(
                      fontSize: rs.sp(32),
                      fontWeight: FontWeight.w800,
                      color: const Color(0xFF191C1A),
                      letterSpacing: -0.6,
                    ),
                  ),
                  SizedBox(height: rs.h(6)),
                  Text(
                    'Use your email and password or your PSU Google account.',
                    style: TextStyle(
                      fontSize: rs.sp(14),
                      color: textSub,
                      height: 1.4,
                    ),
                  ),
                  SizedBox(height: rs.h(32)),

                  Form(
                    key: _passwordForm,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        TextFormField(
                          controller: _emailController,
                          keyboardType: TextInputType.emailAddress,
                          textInputAction: TextInputAction.next,
                          autocorrect: false,
                          validator: (value) => (value ?? '').trim().isEmpty
                              ? 'Enter your email.'
                              : null,
                          decoration: _pillInputDecoration(
                            rs: rs,
                            label: 'Email',
                          ),
                        ),
                        SizedBox(height: rs.h(16)),
                        TextFormField(
                          controller: _passwordController,
                          obscureText: _obscurePassword,
                          textInputAction: TextInputAction.done,
                          autocorrect: false,
                          enableSuggestions: false,
                          onFieldSubmitted: (_) => _submitPassword(),
                          validator: (value) => (value ?? '').isEmpty
                              ? 'Enter your password.'
                              : null,
                          decoration: _pillInputDecoration(
                            rs: rs,
                            label: 'Password',
                            suffixIcon: IconButton(
                              tooltip: _obscurePassword
                                  ? 'Show password'
                                  : 'Hide password',
                              icon: Icon(
                                _obscurePassword
                                    ? Icons.visibility_outlined
                                    : Icons.visibility_off_outlined,
                                color: textSub,
                              ),
                              onPressed: () => setState(
                                () => _obscurePassword = !_obscurePassword,
                              ),
                            ),
                          ),
                        ),
                        SizedBox(height: rs.h(20)),
                        ElevatedButton(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: primaryGreen,
                            foregroundColor: Colors.white,
                            elevation: 0,
                            shape: const StadiumBorder(),
                            minimumSize: buttonSize,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 10,
                            ),
                          ),
                          onPressed: _pendingMethod == null
                              ? _submitPassword
                              : null,
                          child: _pendingMethod == _SignInMethod.password
                              ? _signInProgress('Signing in')
                              : const Text(
                                  'Sign in',
                                  textAlign: TextAlign.center,
                                ),
                        ),
                      ],
                    ),
                  ),
                  SizedBox(height: rs.h(12)),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        backgroundColor: Colors.white,
                        disabledBackgroundColor: Colors.white,
                        foregroundColor: const Color(0xFF1F1F1F),
                        side: const BorderSide(color: Color(0xFF747775)),
                        shape: const StadiumBorder(),
                        minimumSize: buttonSize,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 10,
                        ),
                      ),
                      onPressed: _pendingMethod == null
                          ? () => _handleLogin(_SignInMethod.google)
                          : null,
                      child: _pendingMethod == _SignInMethod.google
                          ? _signInProgress('Signing in with Google')
                          : Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Image.asset(
                                  'assets/google_sign_in_logo.png',
                                  width: 20,
                                  height: 20,
                                  excludeFromSemantics: true,
                                ),
                                const SizedBox(width: 10),
                                const Flexible(
                                  child: Text(
                                    'Sign in with Google',
                                    textAlign: TextAlign.center,
                                  ),
                                ),
                              ],
                            ),
                    ),
                  ),

                  // ── Error banner ────────────────────────────────
                  if (_errorMessage.isNotEmpty) ...[
                    SizedBox(height: rs.h(12)),
                    Container(
                      width: double.infinity,
                      padding: EdgeInsets.symmetric(
                        horizontal: rs.w(14),
                        vertical: rs.h(10),
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFDE8E8),
                        borderRadius: BorderRadius.circular(rs.r(12)),
                        border: Border.all(color: const Color(0xFFF8B4B4)),
                      ),
                      child: Semantics(
                        liveRegion: true,
                        child: Text(
                          _errorMessage,
                          style: TextStyle(
                            color: const Color(0xFF9B1C1C),
                            fontSize: rs.sp(12.5),
                          ),
                        ),
                      ),
                    ),
                    SizedBox(height: rs.h(6)),
                    Padding(
                      padding: EdgeInsets.symmetric(horizontal: rs.w(4)),
                      child: Text(
                        'For help with your HealthLink account, contact the PSU Lingayen Infirmary.',
                        style: TextStyle(
                          color: const Color(0xFF5A635B),
                          fontSize: rs.sp(11.5),
                        ),
                      ),
                    ),
                  ],
                  SizedBox(height: rs.h(12)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
