import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/api_config.dart';
import 'patient_portal_screen.dart';
import 'responder_screen.dart'; // <-- IMPORTED HERE

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController(text: 'student@psu.edu.ph');
  final _passwordController = TextEditingController(text: 'Password123!');
  final _storage = const FlutterSecureStorage();
  bool _isLoading = false;
  String _errorMessage = '';

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
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Valetudo HealthLink')),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.local_hospital_rounded, size: 72, color: Colors.teal),
            const SizedBox(height: 16),
            TextField(
              controller: _emailController,
              decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _passwordController,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            if (_errorMessage.isNotEmpty) Text(_errorMessage, style: const TextStyle(color: Colors.red)),
            const SizedBox(height: 12),
            _isLoading
                ? const CircularProgressIndicator()
                : ElevatedButton(
                    style: ElevatedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                    onPressed: _handleLogin,
                    child: const Text('Sign In'),
                  )
          ],
        ),
      ),
    );
  }
}