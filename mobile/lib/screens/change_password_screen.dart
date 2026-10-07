// mobile/lib/screens/change_password_screen.dart
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';

class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _storage = const FlutterSecureStorage();

  final _currentPasswordController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  bool _obscureAll = true;
  bool _isSaving = false;

  // Real-time strength state
  int _strengthScore = 0; // 0 = empty/very weak, 1 = weak, 2 = fair, 3 = strong, 4 = very strong
  String _strengthLabel = '';

  static const primaryGreen = Color(0xFF284E3A);
  static const textMain = Color(0xFF191C1A);
  static const textSub = Color(0xFF5A635B);
  static const borderColor = Color(0xFFD6DFD5);

  @override
  void initState() {
    super.initState();
    _newPasswordController.addListener(_evaluateStrength);
  }

  @override
  void dispose() {
    _newPasswordController.removeListener(_evaluateStrength);
    _currentPasswordController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  void _evaluateStrength() {
    final pwd = _newPasswordController.text;
    if (pwd.isEmpty) {
      setState(() {
        _strengthScore = 0;
        _strengthLabel = '';
      });
      return;
    }

    int score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;

    final hasUpper = RegExp(r'[A-Z]').hasMatch(pwd);
    final hasLower = RegExp(r'[a-z]').hasMatch(pwd);
    final hasDigit = RegExp(r'[0-9]').hasMatch(pwd);
    final hasSpecial = RegExp(r'[^A-Za-z0-9]').hasMatch(pwd); // All symbols & spaces

    int variety = (hasUpper ? 1 : 0) + (hasLower ? 1 : 0) + (hasDigit ? 1 : 0) + (hasSpecial ? 1 : 0);
    if (variety >= 3) score++;
    if (pwd.length >= 14 && variety == 4) score++;

    score = score.clamp(0, 4);

    const labels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];

    setState(() {
      _strengthScore = score;
      _strengthLabel = labels[score];
    });
  }

  Color _getStrengthColor() {
    switch (_strengthScore) {
      case 1:
        return const Color(0xFFDC2626); // Red
      case 2:
        return const Color(0xFFD97706); // Amber
      case 3:
        return const Color(0xFF2563EB); // Blue
      case 4:
        return const Color(0xFF15803D); // Green
      default:
        return const Color(0xFF94A396);
    }
  }

  Future<void> _updatePassword() async {
    if (!_formKey.currentState!.validate()) return;

    if (_strengthScore < 2) {
      _showError('Please choose a stronger password before submitting.');
      return;
    }

    setState(() => _isSaving = true);
    final token = await _storage.read(key: 'jwt_token');

    try {
      final res = await http.put(
        Uri.parse('${ApiConfig.baseUrl}/api/auth/change-password'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
        body: jsonEncode({
          'currentPassword': _currentPasswordController.text.trim(),
          'newPassword': _newPasswordController.text.trim(),
        }),
      );

      final data = jsonDecode(res.body);

      if (res.statusCode == 200) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Password updated successfully!'),
            backgroundColor: primaryGreen,
          ),
        );
        Navigator.pop(context);
      } else {
        _showError(data['error'] ?? 'Failed to update password.');
      }
    } catch (e) {
      _showError('Network error: $e');
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: const Color(0xFF7A2E26)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7F9F6),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, color: textMain),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text('Back to my profile', style: TextStyle(fontSize: 14, color: textMain, fontWeight: FontWeight.w600)),
        titleSpacing: -6,
      ),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 12.0),
            children: [
              const Text(
                'A LITTLE EXTRA PEACE OF MIND',
                style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, letterSpacing: 1.8, color: textSub),
              ),
              const SizedBox(height: 6),
              const Text(
                'Keep your account safe.',
                style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: textMain, letterSpacing: -0.5),
              ),
              const SizedBox(height: 4),
              const Text(
                'A strong password protects your health records.',
                style: TextStyle(fontSize: 14, color: textSub),
              ),
              const SizedBox(height: 32),

              // Current Password
              const Text('Current password', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: textMain)),
              const SizedBox(height: 8),
              TextFormField(
                controller: _currentPasswordController,
                obscureText: _obscureAll,
                style: const TextStyle(fontSize: 14),
                decoration: _pillInputDecoration('Enter your current password'),
                validator: (val) => (val == null || val.isEmpty) ? 'Please enter current password' : null,
              ),
              const SizedBox(height: 20),

              // New Password
              const Text('New password', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: textMain)),
              const SizedBox(height: 8),
              TextFormField(
                controller: _newPasswordController,
                obscureText: _obscureAll,
                style: const TextStyle(fontSize: 14),
                decoration: _pillInputDecoration('At least 8 characters (letters, numbers, symbols)'),
                validator: (val) {
                  if (val == null || val.isEmpty) return 'Please enter new password';
                  if (val.length < 8) return 'Password must be at least 8 characters';
                  return null;
                },
              ),

              // Dynamic Password Strength Meter
              if (_newPasswordController.text.isNotEmpty) ...[
                const SizedBox(height: 10),
                Row(
                  children: List.generate(4, (index) {
                    final segmentActive = index < _strengthScore;
                    return Expanded(
                      child: Container(
                        height: 4,
                        margin: EdgeInsets.only(right: index < 3 ? 6.0 : 0.0),
                        decoration: BoxDecoration(
                          color: segmentActive ? _getStrengthColor() : const Color(0xFFE2EBE1),
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    );
                  }),
                ),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Strength: $_strengthLabel',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: _getStrengthColor(),
                      ),
                    ),
                    const Text(
                      'All symbols & spaces allowed',
                      style: TextStyle(fontSize: 11, color: textSub),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 20),

              // Confirm New Password
              const Text('Confirm new password', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: textMain)),
              const SizedBox(height: 8),
              TextFormField(
                controller: _confirmPasswordController,
                obscureText: _obscureAll,
                style: const TextStyle(fontSize: 14),
                decoration: _pillInputDecoration('Re-enter new password'),
                validator: (val) {
                  if (val != _newPasswordController.text) return 'Passwords do not match';
                  return null;
                },
              ),
              const SizedBox(height: 14),

              // Toggle visibility
              Row(
                children: [
                  IconButton(
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    icon: Icon(_obscureAll ? Icons.visibility_outlined : Icons.visibility_off_outlined, size: 20, color: textSub),
                    onPressed: () => setState(() => _obscureAll = !_obscureAll),
                  ),
                  const SizedBox(width: 8),
                  Text(_obscureAll ? 'Show passwords' : 'Hide passwords', style: const TextStyle(fontSize: 13, color: textSub, fontWeight: FontWeight.w500)),
                ],
              ),
              const SizedBox(height: 28),

              // Update Button
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: primaryGreen,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: const StadiumBorder(),
                  ),
                  onPressed: _isSaving ? null : _updatePassword,
                  icon: _isSaving
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Icon(Icons.lock_outline, size: 18),
                  label: const Text('Update password', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  InputDecoration _pillInputDecoration(String hint) {
    return InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(color: Color(0xFF94A396), fontSize: 13),
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: const BorderSide(color: borderColor)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: const BorderSide(color: borderColor)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: const BorderSide(color: primaryGreen, width: 1.5)),
    );
  }
}