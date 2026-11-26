// mobile/lib/screens/login_screen.dart
import 'dart:async';
import 'dart:convert';
import 'dart:io' show TlsException;

import 'package:material_ui/material_ui.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import '../config/api_config.dart';
import '../widgets/valetudo_logo.dart';
import '../utils/responsive.dart';
import 'patient_portal_screen.dart';
import 'responder_screen.dart';
import '../services/emergency_alert_service.dart';
import '../services/mobile_sign_in.dart';
import '../theme/account_theme_controller.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, this.sessionNotice});

  final String? sessionNotice;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _storage = const FlutterSecureStorage();

  bool _isLoading = false;
  bool _obscurePassword = true;
  String _errorMessage = '';

  // Brand palette
  static const Color primaryGreen = Color(0xFF284E3A);
  static const Color textSub = Color(0xFF5A635B);
  static const Color borderColor = Color(0xFFD6DFD5);

  Future<void> _handleLogin({required bool demo}) async {
    if (_isLoading) return;
    setState(() {
      _isLoading = true;
      _errorMessage = '';
    });

    try {
      final idToken = demo ? null : await MobileSignIn.googleIdToken();
      if (!mounted || (!demo && idToken == null)) return;
      final endpoint = demo ? 'demo' : 'google';
      final res = await ApiConfig.client
          .post(
            Uri.parse('${ApiConfig.baseUrl}/api/auth/mobile/$endpoint'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(
              demo
                  ? {
                      'email': _emailController.text.trim(),
                      'password': _passwordController.text,
                    }
                  : {'idToken': idToken},
            ),
          )
          .timeout(const Duration(seconds: 15));
      if (!mounted) return;

      final data = jsonDecode(res.body);

      if (res.statusCode == 200) {
        final user = Map<String, dynamic>.from(data['user']);
        final token = data['token'] as String;
        final expectedMethod = demo ? 'mobile_demo' : 'mobile_google';
        if (data['auth_method'] != expectedMethod) {
          throw const FormatException('Unexpected sign-in method');
        }
        user['auth_method'] = expectedMethod;
        // Store the token last so an interrupted write cannot restore a partial session.
        await _storage.delete(key: 'jwt_token');
        await _storage.write(key: 'user_data', value: jsonEncode(user));
        await _storage.write(key: 'jwt_token', value: token);
        if (!mounted) return;
        await AccountThemeScope.of(context).bindAccount(user, token);

        if (!mounted) return;
        EmergencyAlertService().beginSession(token, user['user_id']);
        final List<dynamic> roles = user['roles'] ?? [];

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
      } else {
        setState(() => _errorMessage = data['error'] ?? 'Login failed');
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _errorMessage = switch (error) {
            TlsException() => 'Could not establish a secure connection. Check the server certificate or contact the clinic administrator.',
            TimeoutException() || http.ClientException() => 'Could not reach the clinic server. Check your network and try again.',
            FormatException() => 'The clinic server returned an unexpected response. Please try again.',
            StateError(:final message) => message,
            _ => 'Could not sign in. Please try again.',
          };
        });
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  InputDecoration _pillInputDecoration({
    required Rs rs,
    required String hint,
    Widget? suffixIcon,
  }) {
    final radius = BorderRadius.circular(rs.r(22));
    return InputDecoration(
      hintText: hint,
      hintStyle: TextStyle(color: const Color(0xFF94A396), fontSize: rs.sp(14)),
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

  @override
  Widget build(BuildContext context) {
    final rs = Rs.of(context);

    // On tablets, keep the form column readable instead of stretching
    // edge-to-edge. On phones it fills the full width minus padding.
    final contentMaxWidth = rs.isTablet ? 460.0 : double.infinity;

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
                      Column(
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

                  // ── Headline ─────────────────────────────────────
                  Text(
                    'YOUR CAMPUS CARE, CONNECTED',
                    style: TextStyle(
                      fontSize: rs.sp(10.5),
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.8,
                      color: textSub,
                    ),
                  ),
                  SizedBox(height: rs.h(8)),
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
                    'Sign in with your official @psu.edu.ph Google account.',
                    style: TextStyle(
                      fontSize: rs.sp(14),
                      color: textSub,
                      height: 1.4,
                    ),
                  ),
                  SizedBox(height: rs.h(32)),

                  if (MobileSignIn.allowDemo) ...[
                    // ── Email ────────────────────────────────────────
                    Text(
                      'Demo email',
                      style: TextStyle(
                        fontSize: rs.sp(13),
                        fontWeight: FontWeight.w700,
                        color: const Color(0xFF191C1A),
                      ),
                    ),
                    SizedBox(height: rs.h(8)),
                    TextFormField(
                      controller: _emailController,
                      keyboardType: TextInputType.emailAddress,
                      style: TextStyle(
                        fontSize: rs.sp(14),
                        color: const Color(0xFF191C1A),
                      ),
                      decoration: _pillInputDecoration(
                        rs: rs,
                        hint: 'Enter the demo email',
                      ),
                    ),
                    SizedBox(height: rs.h(20)),

                    // ── Password ─────────────────────────────────────
                    Text(
                      'Password',
                      style: TextStyle(
                        fontSize: rs.sp(13),
                        fontWeight: FontWeight.w700,
                        color: const Color(0xFF191C1A),
                      ),
                    ),
                    SizedBox(height: rs.h(8)),
                    TextFormField(
                      controller: _passwordController,
                      obscureText: _obscurePassword,
                      style: TextStyle(
                        fontSize: rs.sp(14),
                        color: const Color(0xFF191C1A),
                      ),
                      decoration: _pillInputDecoration(
                        rs: rs,
                        hint: 'Enter your password',
                        suffixIcon: IconButton(
                          icon: Icon(
                            _obscurePassword
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined,
                            size: rs.w(20),
                            color: textSub,
                          ),
                          onPressed: () => setState(
                            () => _obscurePassword = !_obscurePassword,
                          ),
                        ),
                      ),
                    ),
                    SizedBox(height: rs.h(14)),

                    OutlinedButton(
                      onPressed: _isLoading
                          ? null
                          : () => _handleLogin(demo: true),
                      child: const Text('Sign in with demo account'),
                    ),
                  ],

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
                      child: Text(
                        _errorMessage,
                        style: TextStyle(
                          color: const Color(0xFF9B1C1C),
                          fontSize: rs.sp(12.5),
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
                  SizedBox(height: rs.h(24)),

                  // ── Sign in button ──────────────────────────────
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: primaryGreen,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        shape: const StadiumBorder(),
                        minimumSize: Size(48, rs.h(52).clamp(48.0, 58.0)),
                      ),
                      onPressed: _isLoading
                          ? null
                          : () => _handleLogin(demo: false),
                      child: _isLoading
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Flexible(
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 10,
                                    ),
                                    child: Text(
                                      'Sign in with Google',
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                        fontSize: rs.sp(15),
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                ),
                                SizedBox(width: rs.w(8)),
                                const Icon(
                                  Icons.arrow_forward_rounded,
                                  size: 18,
                                ),
                              ],
                            ),
                    ),
                  ),

                  SizedBox(height: rs.h(48)),

                  // ── Community footer ────────────────────────────
                  Center(
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.verified_user_outlined,
                          size: rs.w(16),
                          color: textSub,
                        ),
                        SizedBox(width: rs.w(6)),
                        Flexible(
                          child: Text(
                            'A little care goes a long way.',
                            style: TextStyle(
                              fontSize: rs.sp(12),
                              color: textSub,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
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
