import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

void main() {
  runApp(const ValetudoMobileApp());
}

class ValetudoMobileApp extends StatelessWidget {
  const ValetudoMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Valetudo HealthLink',
      theme: ThemeData(primarySwatch: Colors.teal),
      home: const LoginScreen(),
    );
  }
}

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

  // Android emulator routes host machine localhost as 10.0.2.2
  String get baseUrl => Platform.isAndroid ? 'http://192.168.18.2:5000' : 'http://localhost:5000';

  Future<void> _handleLogin() async {
    setState(() {
      _isLoading = true;
      _errorMessage = '';
    });

    try {
      final response = await http.post(
        Uri.parse('$baseUrl/api/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'email': _emailController.text.trim(),
          'password': _passwordController.text.trim(),
        }),
      );

      final data = jsonDecode(response.body);

      if (response.statusCode == 200) {
        // Save JWT safely in mobile keychain
        await _storage.write(key: 'jwt_token', value: data['token']);

        if (!mounted) return;
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (context) => StudentHomeScreen(user: data['user']),
          ),
        );
      } else {
        setState(() {
          _errorMessage = data['error'] ?? 'Login failed';
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'Network connection failed: $e';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Valetudo HealthLink - Login')),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.local_hospital, size: 70, color: Colors.teal),
            const SizedBox(height: 20),
            TextField(
              controller: _emailController,
              decoration: const InputDecoration(labelText: 'PSU Email', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 15),
            TextField(
              controller: _passwordController,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 15),
            if (_errorMessage.isNotEmpty)
              Text(_errorMessage, style: const TextStyle(color: Colors.red)),
            const SizedBox(height: 15),
            _isLoading
                ? const CircularProgressIndicator()
                : ElevatedButton(
                    onPressed: _handleLogin,
                    style: ElevatedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                    child: const Text('Sign In as Student'),
                  ),
          ],
        ),
      ),
    );
  }
}

class StudentHomeScreen extends StatelessWidget {
  final Map<String, dynamic> user;
  const StudentHomeScreen({super.key, required this.user});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Welcome, ${user['first_name']}!')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.check_circle, color: Colors.green, size: 80),
            const SizedBox(height: 10),
            Text('Logged in as: ${user['email']}', style: const TextStyle(fontSize: 16)),
            Text('Roles: ${(user['roles'] as List).join(", ")}', style: const TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
      ),
    );
  }
}