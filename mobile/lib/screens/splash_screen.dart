// mobile/lib/screens/splash_screen.dart
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';
import 'login_screen.dart';
import 'patient_portal_screen.dart';
import 'responder_screen.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  final _storage = const FlutterSecureStorage();

  @override
  void initState() {
    super.initState();
    _checkSavedSession();
  }

  Future<void> _checkSavedSession() async {
    final token = await _storage.read(key: 'jwt_token');
    final userDataStr = await _storage.read(key: 'user_data');

    // 1. If no saved credentials, go straight to login
    if (token == null || userDataStr == null) {
      _goToLogin();
      return;
    }

    try {
      // 2. Validate token against backend (with a 3-second timeout in case offline)
      final res = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/api/users/me'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 3));

      if (res.statusCode == 200) {
        _routeUser(jsonDecode(userDataStr));
        return;
      }
    } catch (_) {
      // 3. Fallback for offline/development: If server is temporarily asleep, 
      // trust local secure storage so you don't get kicked out while testing.
      _routeUser(jsonDecode(userDataStr));
      return;
    }

    // If token was rejected by server (e.g. 401 or 403 expired)
    await _storage.deleteAll();
    _goToLogin();
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
    if (!mounted) return;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.local_hospital_rounded, size: 72, color: Colors.teal),
            SizedBox(height: 16),
            Text(
              'Valetudo HealthLink',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.teal),
            ),
            SizedBox(height: 8),
            Text('Restoring session...', style: TextStyle(color: Colors.black54, fontSize: 13)),
            SizedBox(height: 24),
            CircularProgressIndicator(color: Colors.teal),
          ],
        ),
      ),
    );
  }
}