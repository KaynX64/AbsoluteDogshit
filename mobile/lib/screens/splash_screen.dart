// mobile/lib/screens/splash_screen.dart
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';
import '../widgets/valetudo_logo.dart';
import 'login_screen.dart';
import 'patient_portal_screen.dart';
import 'responder_screen.dart';
import '../services/emergency_alert_service.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  final _storage = const FlutterSecureStorage();
  bool _isChecking = true;

  static const Color primaryGreen = Color(0xFF284E3A);
  static const Color textMain = Color(0xFF191C1A);
  static const Color textSub = Color(0xFF506054);
  static const Color backgroundColor = Color(0xFFE2EBE2);

  @override
  void initState() {
    super.initState();
    _checkSavedSession();
  }

  Future<void> _checkSavedSession() async {
    final token = await _storage.read(key: 'jwt_token');
    final userDataStr = await _storage.read(key: 'user_data');

    // Brief delay to allow smooth launch branding
    await Future.delayed(const Duration(milliseconds: 800));

    if (token == null || userDataStr == null) {
      if (mounted) setState(() => _isChecking = false);
      return;
    }

    try {
      final res = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/api/users/me'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 4));

      if (res.statusCode == 200) {
        EmergencyAlertService().syncFcmTokenWithBackend();
        _routeUser(jsonDecode(userDataStr));
        return;
      }
    } catch (_) {
      // Offline fallback
      _routeUser(jsonDecode(userDataStr));
      return;
    }

    // Token rejected or expired
    await _storage.deleteAll();
    if (mounted) setState(() => _isChecking = false);
  }

  void _routeUser(Map<String, dynamic> user) {
    if (!mounted) return;
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
  }

  void _goToLogin() {
    Navigator.pushReplacement(
      context,
      PageRouteBuilder(
        pageBuilder: (context, animation, secondaryAnimation) => const LoginScreen(),
        transitionsBuilder: (context, animation, secondaryAnimation, child) =>
            FadeTransition(opacity: animation, child: child),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: backgroundColor,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            return SingleChildScrollView(
              physics: const ClampingScrollPhysics(),
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  minHeight: constraints.maxHeight,
                  minWidth: constraints.maxWidth,
                ),
                child: SizedBox(
                  width: constraints.maxWidth,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      // 1. Top Header
                      const Padding(
                        padding: EdgeInsets.only(top: 28.0, left: 24.0, right: 24.0),
                        child: Text(
                          'PANGASINAN STATE UNIVERSITY',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 2.8,
                            color: Color(0xFF4A554D),
                          ),
                        ),
                      ),

                      // 2. Center Branding & Action Block
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 16.0),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            // Valetudo brand logo (lion + cross + heart)
                            const ValetudoLogo(size: 130, padded: true),
                            const SizedBox(height: 24),

                            // Main Brand Text
                            const Text(
                              'valetudo.',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 38,
                                fontWeight: FontWeight.w900,
                                color: textMain,
                                letterSpacing: -0.6,
                                height: 1.1,
                              ),
                            ),
                            const SizedBox(height: 6),
                            const Text(
                              'H E A L T H L I N K',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 4.8,
                                color: Color(0xFF4D6053),
                              ),
                            ),
                            const SizedBox(height: 18),
                            const Text(
                              'Your campus care, connected.',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 14.5,
                                color: textSub,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            const SizedBox(height: 32),

                            // Let's get started Button
                            SizedBox(
                              width: 240,
                              height: 54,
                              child: ElevatedButton(
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: primaryGreen,
                                  foregroundColor: Colors.white,
                                  elevation: 0,
                                  shape: const StadiumBorder(),
                                ),
                                onPressed: _isChecking ? null : _goToLogin,
                                child: _isChecking
                                    ? const SizedBox(
                                        width: 22,
                                        height: 22,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2.2,
                                          color: Colors.white,
                                        ),
                                      )
                                    : const Row(
                                        mainAxisAlignment: MainAxisAlignment.center,
                                        children: [
                                          Text(
                                            "Let's get started",
                                            style: TextStyle(
                                              fontSize: 15.5,
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                          SizedBox(width: 8),
                                          Icon(Icons.arrow_forward_rounded, size: 18),
                                        ],
                                      ),
                              ),
                            ),
                          ],
                        ),
                      ),

                      // 3. Bottom Infirmary Footer
                      const Padding(
                        padding: EdgeInsets.only(bottom: 24.0, left: 24.0, right: 24.0),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            Text(
                              'Lingayen Campus Infirmary',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: textSub,
                              ),
                            ),
                            SizedBox(height: 4),
                            Text(
                              'A little care goes a long way.',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 12.5,
                                color: textSub,
                                fontStyle: FontStyle.italic,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}