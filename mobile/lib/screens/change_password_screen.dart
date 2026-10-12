// mobile/lib/screens/change_password_screen.dart
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';
import '../utils/responsive.dart';

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

  int _strengthScore = 0;
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

    final hasMinLength = pwd.length >= 8;
    final hasUpper = RegExp(r'[A-Z]').hasMatch(pwd);
    final hasLower = RegExp(r'[a-z]').hasMatch(pwd);
    final hasDigit = RegExp(r'[0-9]').hasMatch(pwd);
    final hasSpecial = RegExp(r'[^A-Za-z0-9]').hasMatch(pwd);
    final variety =
        [hasUpper, hasLower, hasDigit, hasSpecial].where((v) => v).length;

    int score = 0;
    if (hasMinLength) score++;
    if (pwd.length >= 12) score++;
    if (variety >= 3) score++;
    if (pwd.length >= 14 && variety == 4) score++;

    if (!hasMinLength || variety < 3) {
      if (score > 1) score = 1;
    }
    score = score.clamp(0, 4);

    const labels = ['Very Weak', 'Weak', 'Medium', 'Strong', 'Very Strong'];

    setState(() {
      _strengthScore = score;
      _strengthLabel = labels[score];
    });
  }

  Color _getStrengthColor() {
    switch (_strengthScore) {
      case 1:
        return const Color(0xFFDC2626);
      case 2:
        return const Color(0xFFD97706);
      case 3:
        return const Color(0xFF2563EB);
      case 4:
        return const Color(0xFF15803D);
      default:
        return const Color(0xFF94A396);
    }
  }

  Future<void> _updatePassword() async {
    if (!_formKey.currentState!.validate()) return;

    if (_strengthScore < 2) {
      _showError(
        'Password is too weak. It must be at least Medium strength — check the requirements list.',
      );
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
        final detailed =
            (data['issues'] is List && (data['issues'] as List).isNotEmpty)
                ? (data['issues'] as List).join(' ')
                : data['error'] ?? 'Failed to update password.';
        _showError(detailed);
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
      SnackBar(
        content: Text(message),
        backgroundColor: const Color(0xFF7A2E26),
      ),
    );
  }

  InputDecoration _pillInputDecoration(Rs rs, String hint) {
    final radius = BorderRadius.circular(rs.r(22));
    return InputDecoration(
      hintText: hint,
      hintStyle: TextStyle(color: const Color(0xFF94A396), fontSize: rs.sp(13)),
      filled: true,
      fillColor: Colors.white,
      contentPadding: EdgeInsets.symmetric(
        horizontal: rs.w(20),
        vertical: rs.h(16),
      ),
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
        borderSide: const BorderSide(color: primaryGreen, width: 1.5),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final rs = Rs.of(context);
    final maxContentWidth = rs.isTablet ? 560.0 : double.infinity;

    return Scaffold(
      backgroundColor: const Color(0xFFF7F9F6),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, color: textMain),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          'Back to my profile',
          style: TextStyle(
            fontSize: rs.sp(14),
            color: textMain,
            fontWeight: FontWeight.w600,
          ),
        ),
        titleSpacing: -6,
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: maxContentWidth),
            child: Form(
              key: _formKey,
              child: ListView(
                padding: EdgeInsets.symmetric(
                  horizontal: rs.w(24),
                  vertical: rs.h(12),
                ),
                children: [
                  Text(
                    'A LITTLE EXTRA PEACE OF MIND',
                    style: TextStyle(
                      fontSize: rs.sp(10.5),
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.8,
                      color: textSub,
                    ),
                  ),
                  SizedBox(height: rs.h(6)),
                  Text(
                    'Keep your account safe.',
                    style: TextStyle(
                      fontSize: rs.sp(30),
                      fontWeight: FontWeight.w800,
                      color: textMain,
                      letterSpacing: -0.5,
                    ),
                  ),
                  SizedBox(height: rs.h(4)),
                  Text(
                    'A strong password protects your health records.',
                    style: TextStyle(fontSize: rs.sp(14), color: textSub),
                  ),
                  SizedBox(height: rs.h(32)),

                  // Current Password
                  Text(
                    'Current password',
                    style: TextStyle(
                      fontSize: rs.sp(13),
                      fontWeight: FontWeight.w700,
                      color: textMain,
                    ),
                  ),
                  SizedBox(height: rs.h(8)),
                  TextFormField(
                    controller: _currentPasswordController,
                    obscureText: _obscureAll,
                    style: TextStyle(fontSize: rs.sp(14)),
                    decoration: _pillInputDecoration(
                      rs,
                      'Enter your current password',
                    ),
                    validator: (val) => (val == null || val.isEmpty)
                        ? 'Please enter current password'
                        : null,
                  ),
                  SizedBox(height: rs.h(20)),

                  // New Password
                  Text(
                    'New password',
                    style: TextStyle(
                      fontSize: rs.sp(13),
                      fontWeight: FontWeight.w700,
                      color: textMain,
                    ),
                  ),
                  SizedBox(height: rs.h(8)),
                  TextFormField(
                    controller: _newPasswordController,
                    obscureText: _obscureAll,
                    style: TextStyle(fontSize: rs.sp(14)),
                    decoration: _pillInputDecoration(
                      rs,
                      'At least 8 characters (letters, numbers, symbols)',
                    ),
                    validator: (val) {
                      if (val == null || val.isEmpty) {
                        return 'Please enter new password';
                      }
                      if (val.length < 8) {
                        return 'Password must be at least 8 characters';
                      }
                      return null;
                    },
                  ),

                  // Strength meter
                  if (_newPasswordController.text.isNotEmpty) ...[
                    SizedBox(height: rs.h(10)),

                    Row(
                      children: List.generate(4, (index) {
                        final segmentActive = index < _strengthScore;
                        return Expanded(
                          child: Container(
                            height: 4,
                            margin: EdgeInsets.only(
                              right: index < 3 ? rs.w(6) : 0,
                            ),
                            decoration: BoxDecoration(
                              color: segmentActive
                                  ? _getStrengthColor()
                                  : const Color(0xFFE2EBE1),
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                        );
                      }),
                    ),
                    SizedBox(height: rs.h(6)),

                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Flexible(
                          child: Text(
                            'Strength: $_strengthLabel',
                            style: TextStyle(
                              fontSize: rs.sp(12),
                              fontWeight: FontWeight.w700,
                              color: _getStrengthColor(),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        SizedBox(width: rs.w(6)),
                        Flexible(
                          child: Text(
                            _strengthScore >= 2
                                ? '✓ Meets requirements'
                                : '✕ Must be Medium or better',
                            style: TextStyle(
                              fontSize: rs.sp(11),
                              fontWeight: FontWeight.w700,
                              color: _strengthScore >= 2
                                  ? const Color(0xFF15803D)
                                  : const Color(0xFFDC2626),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.end,
                          ),
                        ),
                      ],
                    ),

                    _PasswordRequirementsPanel(
                      rs: rs,
                      password: _newPasswordController.text,
                    ),
                  ],
                  SizedBox(height: rs.h(20)),

                  // Confirm New Password
                  Text(
                    'Confirm new password',
                    style: TextStyle(
                      fontSize: rs.sp(13),
                      fontWeight: FontWeight.w700,
                      color: textMain,
                    ),
                  ),
                  SizedBox(height: rs.h(8)),
                  TextFormField(
                    controller: _confirmPasswordController,
                    obscureText: _obscureAll,
                    style: TextStyle(fontSize: rs.sp(14)),
                    decoration: _pillInputDecoration(
                      rs,
                      'Re-enter new password',
                    ),
                    validator: (val) {
                      if (val != _newPasswordController.text) {
                        return 'Passwords do not match';
                      }
                      return null;
                    },
                  ),
                  SizedBox(height: rs.h(14)),

                  // Toggle visibility
                  Row(
                    children: [
                      IconButton(
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                        icon: Icon(
                          _obscureAll
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                          size: rs.w(20),
                          color: textSub,
                        ),
                        onPressed: () =>
                            setState(() => _obscureAll = !_obscureAll),
                      ),
                      SizedBox(width: rs.w(8)),
                      Flexible(
                        child: Text(
                          _obscureAll ? 'Show passwords' : 'Hide passwords',
                          style: TextStyle(
                            fontSize: rs.sp(13),
                            color: textSub,
                            fontWeight: FontWeight.w500,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: rs.h(28)),

                  // Update button
                  SizedBox(
                    width: double.infinity,
                    height: rs.h(52).clamp(46.0, 58.0),
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: primaryGreen,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        shape: const StadiumBorder(),
                      ),
                      onPressed:
                          (_isSaving || _strengthScore < 2) ? null : _updatePassword,
                      icon: _isSaving
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2,
                              ),
                            )
                          : const Icon(Icons.lock_outline, size: 18),
                      label: Text(
                        'Update password',
                        style: TextStyle(
                          fontSize: rs.sp(15),
                          fontWeight: FontWeight.w700,
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
    );
  }
}

// ─────────────────────────────────────────────────────────────────
// PASSWORD STRENGTH UI HELPERS
// ─────────────────────────────────────────────────────────────────

class _PasswordRequirement extends StatelessWidget {
  final Rs rs;
  final bool met;
  final String label;

  const _PasswordRequirement({
    required this.rs,
    required this.met,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    const okGreen = Color(0xFF15803D);
    const okBg = Color(0xFFDCFCE7);
    const okBorder = Color(0xFFBBF7D0);
    const pendingGrey = Color(0xFF94A396);
    const pendingBg = Color(0xFFEEF3EC);
    const pendingBorder = Color(0xFFDCE4DA);

    final checkSize = rs.w(14).clamp(12.0, 16.0);

    return Padding(
      padding: EdgeInsets.symmetric(vertical: rs.h(3)),
      child: Row(
        children: [
          Container(
            width: checkSize,
            height: checkSize,
            decoration: BoxDecoration(
              color: met ? okBg : pendingBg,
              shape: BoxShape.circle,
              border: Border.all(
                color: met ? okBorder : pendingBorder,
                width: 1,
              ),
            ),
            alignment: Alignment.center,
            child: met
                ? Icon(Icons.check, size: checkSize * 0.65, color: okGreen)
                : null,
          ),
          SizedBox(width: rs.w(8)),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontSize: rs.sp(11.5),
                fontWeight: FontWeight.w600,
                color: met ? okGreen : pendingGrey,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PasswordRequirementsPanel extends StatelessWidget {
  final Rs rs;
  final String password;

  const _PasswordRequirementsPanel({
    required this.rs,
    required this.password,
  });

  @override
  Widget build(BuildContext context) {
    final hasMinLength = password.length >= 8;
    final hasUpper = RegExp(r'[A-Z]').hasMatch(password);
    final hasLower = RegExp(r'[a-z]').hasMatch(password);
    final hasDigit = RegExp(r'[0-9]').hasMatch(password);
    final hasSpecial = RegExp(r'[^A-Za-z0-9]').hasMatch(password);

    return Container(
      margin: EdgeInsets.only(top: rs.h(10)),
      padding: EdgeInsets.symmetric(
        horizontal: rs.w(14),
        vertical: rs.h(12),
      ),
      decoration: BoxDecoration(
        color: const Color(0xFFF7F9F6),
        borderRadius: BorderRadius.circular(rs.r(14)),
        border: Border.all(color: const Color(0xFFE8EDE6)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Password requirements',
            style: TextStyle(
              fontSize: rs.sp(10.5),
              fontWeight: FontWeight.w800,
              letterSpacing: 1.2,
              color: const Color(0xFF94A396),
            ),
          ),
          SizedBox(height: rs.h(6)),
          _PasswordRequirement(
            rs: rs,
            met: hasMinLength,
            label: 'At least 8 characters',
          ),
          _PasswordRequirement(
            rs: rs,
            met: hasUpper,
            label: 'One uppercase letter (A–Z)',
          ),
          _PasswordRequirement(
            rs: rs,
            met: hasLower,
            label: 'One lowercase letter (a–z)',
          ),
          _PasswordRequirement(
            rs: rs,
            met: hasDigit,
            label: 'One number (0–9)',
          ),
          _PasswordRequirement(
            rs: rs,
            met: hasSpecial,
            label: 'One symbol (!@#\$%^&*…)',
          ),
        ],
      ),
    );
  }
}