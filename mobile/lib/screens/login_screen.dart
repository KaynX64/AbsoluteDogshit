// mobile/lib/screens/login_screen.dart
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/api_config.dart';
import '../widgets/valetudo_logo.dart';
import '../utils/responsive.dart';
import 'patient_portal_screen.dart';
import 'responder_screen.dart';
import '../services/emergency_alert_service.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _storage = const FlutterSecureStorage();

  bool _isLoading = false;
  bool _obscurePassword = true;
  bool _rememberMe = true;
  String _errorMessage = '';

  // Brand palette
  static const Color primaryGreen = Color(0xFF284E3A);
  static const Color textSub = Color(0xFF5A635B);
  static const Color borderColor = Color(0xFFD6DFD5);

  Future<void> _handleLogin() async {
    setState(() {
      _isLoading = true;
      _errorMessage = '';
    });

    try {
      final res = await http.post(
        Uri.parse('${ApiConfig.baseUrl}/api/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'email': _emailController.text.trim(),
          'password': _passwordController.text.trim(),
        }),
      );

      final data = jsonDecode(res.body);

      if (res.statusCode == 200) {
        // Save BOTH token and user profile into secure storage
        await _storage.write(key: 'jwt_token', value: data['token']);
        await _storage.write(key: 'user_data', value: jsonEncode(data['user']));

        // Sync device token for FCM background alerts
        try {
          await EmergencyAlertService().syncFcmTokenWithBackend();
        } catch (_) {}

        if (!mounted) return;

        final List<dynamic> roles = data['user']['roles'] ?? [];

        if (roles.contains('EMERGENCY_RESPONDER')) {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (_) => ResponderScreen(user: data['user'])),
          );
        } else {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (_) => PatientPortalScreen(user: data['user'])),
          );
        }
      } else {
        setState(() => _errorMessage = data['error'] ?? 'Login failed');
      }
    } catch (e) {
      if (mounted) {
        setState(() => _errorMessage = 'Unable to connect. Please try again.');
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
                            'valetudo.',
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
                    'A little care starts here. Sign in to your patient portal.',
                    style: TextStyle(
                      fontSize: rs.sp(14),
                      color: textSub,
                      height: 1.4,
                    ),
                  ),
                  SizedBox(height: rs.h(32)),

                  // ── Email ────────────────────────────────────────
                  Text(
                    'University email',
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
                      hint: 'you@psu.edu.ph',
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
                        onPressed: () =>
                            setState(() => _obscurePassword = !_obscurePassword),
                      ),
                    ),
                  ),
                  SizedBox(height: rs.h(14)),

                  // ── Remember me / forgot password ───────────────
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          SizedBox(
                            height: rs.h(24),
                            width: rs.w(24),
                            child: Checkbox(
                              value: _rememberMe,
                              activeColor: primaryGreen,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(rs.r(4)),
                              ),
                              onChanged: (val) =>
                                  setState(() => _rememberMe = val ?? true),
                            ),
                          ),
                          SizedBox(width: rs.w(8)),
                          Text(
                            'Remember me',
                            style: TextStyle(
                              fontSize: rs.sp(13),
                              color: textSub,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                      TextButton(
                        onPressed: () {},
                        style: TextButton.styleFrom(padding: EdgeInsets.zero),
                        child: Text(
                          'Forgot password?',
                          style: TextStyle(
                            fontSize: rs.sp(13),
                            color: primaryGreen,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
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
                        'Tip: Ensure you are using your official @psu.edu.ph email address. If you need an account created, visit the PSU Lingayen Infirmary.',
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
                    height: rs.h(52).clamp(46.0, 58.0),
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: primaryGreen,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        shape: const StadiumBorder(),
                      ),
                      onPressed: _isLoading ? null : _handleLogin,
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
                                Text(
                                  'Sign in to portal',
                                  style: TextStyle(
                                    fontSize: rs.sp(15),
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                SizedBox(width: rs.w(8)),
                                const Icon(Icons.arrow_forward_rounded, size: 18),
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
                        Text(
                          'A little care goes a long way.',
                          style: TextStyle(
                            fontSize: rs.sp(12),
                            color: textSub,
                            fontWeight: FontWeight.w500,
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