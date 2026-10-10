// mobile/lib/screens/splash_screen.dart
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';
import '../widgets/valetudo_logo.dart';
import '../utils/responsive.dart';
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

    // No saved credentials at all → genuine first run
    if (token == null || userDataStr == null) {
      if (mounted) setState(() => _isChecking = false);
      return;
    }

    Map<String, dynamic> cachedUser;
    try {
      cachedUser = jsonDecode(userDataStr) as Map<String, dynamic>;
    } catch (_) {
      // Corrupt cache — treat as first run
      await _storage.deleteAll();
      if (mounted) setState(() => _isChecking = false);
      return;
    }

    // Optimistically route the user with the cached session. The API
    // round-trip below only exists to detect a *revoked* token; any
    // other outcome (offline, 500, timeout) keeps the user logged in.
    try {
      final res = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/api/profile/me'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 4));

      // Only a genuine auth rejection should log the user out.
      if (res.statusCode == 401 || res.statusCode == 403) {
        await _storage.deleteAll();
        if (mounted) setState(() => _isChecking = false);
        return;
      }
      // 200, 500, 404, anything else → trust the cached session.
    } catch (_) {
      // Network unreachable → trust the cached session (offline mode).
    }

    EmergencyAlertService().syncFcmTokenWithBackend();
    _routeUser(cachedUser);
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
    final rs = Rs.of(context);

    // Logo scales between 100 and 160 px; padding between 4.5% and 6%.
    final logoSize = rs.w(130).clamp(100.0, 160.0);
    final buttonWidth = rs.w(240).clamp(200.0, 300.0);
    final buttonHeight = rs.h(54).clamp(48.0, 60.0);

    // On a short landscape screen, drop the eyebrow + footer text so
    // the branding block still fits above the fold.
    final showHeader = !rs.isShort;
    final showFooter = !rs.isShort;

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
                  child: Padding(
                    padding: EdgeInsets.symmetric(horizontal: rs.w(24)),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        // ── Top: university eyebrow ────────────────
                        if (showHeader)
                          Padding(
                            padding: EdgeInsets.only(top: rs.h(28)),
                            child: Text(
                              'PANGASINAN STATE UNIVERSITY',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: rs.sp(11.5),
                                fontWeight: FontWeight.w700,
                                letterSpacing: 2.8,
                                color: const Color(0xFF4A554D),
                              ),
                            ),
                          )
                        else
                          SizedBox(height: rs.h(24)),

                        // ── Center: brand + CTA ────────────────────
                        Padding(
                          padding: EdgeInsets.symmetric(vertical: rs.h(16)),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              ValetudoLogo(size: logoSize, padded: true),
                              SizedBox(height: rs.h(24)),

                              Text(
                                'valetudo.',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: rs.sp(38),
                                  fontWeight: FontWeight.w900,
                                  color: textMain,
                                  letterSpacing: -0.6,
                                  height: 1.1,
                                ),
                              ),
                              SizedBox(height: rs.h(6)),

                              Text(
                                'H E A L T H L I N K',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: rs.sp(11),
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 4.8,
                                  color: const Color(0xFF4D6053),
                                ),
                              ),
                              SizedBox(height: rs.h(18)),

                              Text(
                                'Your campus care, connected.',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: rs.sp(14.5),
                                  color: textSub,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                              SizedBox(height: rs.h(32)),

                              // ── CTA button ─────────────────────────
                              SizedBox(
                                width: buttonWidth,
                                height: buttonHeight,
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
                                      : Row(
                                          mainAxisAlignment: MainAxisAlignment.center,
                                          children: [
                                            Text(
                                              "Let's get started",
                                              style: TextStyle(
                                                fontSize: rs.sp(15.5),
                                                fontWeight: FontWeight.w700,
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
                            ],
                          ),
                        ),

                        // ── Bottom: infirmary footer ───────────────
                        if (showFooter)
                          Padding(
                            padding: EdgeInsets.only(bottom: rs.h(24)),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.center,
                              children: [
                                Text(
                                  'Lingayen Campus Infirmary',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontSize: rs.sp(13),
                                    fontWeight: FontWeight.w600,
                                    color: textSub,
                                  ),
                                ),
                                SizedBox(height: rs.h(4)),
                                Text(
                                  'A little care goes a long way.',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontSize: rs.sp(12.5),
                                    color: textSub,
                                    fontStyle: FontStyle.italic,
                                  ),
                                ),
                              ],
                            ),
                          )
                        else
                          SizedBox(height: rs.h(24)),
                      ],
                    ),
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