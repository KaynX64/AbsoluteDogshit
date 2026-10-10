// mobile/lib/screens/edit_profile_screen.dart
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';
import '../utils/responsive.dart';

class EditProfileScreen extends StatefulWidget {
  final Map<String, dynamic> user;
  final Map<String, dynamic>? healthProfile;

  const EditProfileScreen({
    super.key,
    required this.user,
    required this.healthProfile,
  });

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  final _storage = const FlutterSecureStorage();

  late TextEditingController _phoneController;
  late TextEditingController _emContactNameController;
  late TextEditingController _emContactPhoneController;

  bool _isSaving = false;

  static const primaryGreen = Color(0xFF284E3A);
  static const textMain = Color(0xFF191C1A);
  static const textSub = Color(0xFF5A635B);
  static const borderColor = Color(0xFFD6DFD5);

  @override
  void initState() {
    super.initState();
    final u = widget.user;
    final hp = widget.healthProfile ?? {};

    _phoneController = TextEditingController(text: u['phone'] ?? '');
    _emContactNameController =
        TextEditingController(text: hp['emergency_contact_name'] ?? '');
    _emContactPhoneController =
        TextEditingController(text: hp['emergency_contact_phone'] ?? '');
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _emContactNameController.dispose();
    _emContactPhoneController.dispose();
    super.dispose();
  }

  Future<void> _saveProfile() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSaving = true);
    final token = await _storage.read(key: 'jwt_token');

    final payload = {
      'phone': _phoneController.text.trim(),
      'emergency_contact_name': _emContactNameController.text.trim(),
      'emergency_contact_phone': _emContactPhoneController.text.trim(),
    };

    try {
      final res = await http.put(
        Uri.parse('${ApiConfig.baseUrl}/api/profile/me'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
        body: jsonEncode(payload),
      );

      if (res.statusCode == 200) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Contact details updated successfully!'),
            backgroundColor: primaryGreen,
          ),
        );
        Navigator.pop(context, true);
      } else {
        final err = jsonDecode(res.body)['error'] ?? 'Update failed.';
        _showError(err);
      }
    } catch (e) {
      _showError('Network error: $e');
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: const Color(0xFF7A2E26),
      ),
    );
  }

  InputDecoration _pillInputDecoration({
    required Rs rs,
    required String hint,
    required IconData icon,
  }) {
    final radius = BorderRadius.circular(rs.r(22));
    return InputDecoration(
      hintText: hint,
      prefixIcon: Icon(
        icon,
        size: rs.w(18).clamp(16.0, 20.0),
        color: textSub,
      ),
      hintStyle: TextStyle(
        color: const Color(0xFF94A396),
        fontSize: rs.sp(14),
      ),
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
          'Back to profile',
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
                    'KEEP IN TOUCH',
                    style: TextStyle(
                      fontSize: rs.sp(10.5),
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.8,
                      color: textSub,
                    ),
                  ),
                  SizedBox(height: rs.h(6)),
                  Text(
                    'Edit contact details.',
                    style: TextStyle(
                      fontSize: rs.sp(30),
                      fontWeight: FontWeight.w800,
                      color: textMain,
                      letterSpacing: -0.5,
                    ),
                  ),
                  SizedBox(height: rs.h(4)),
                  Text(
                    'Keep your personal and emergency contacts updated.',
                    style: TextStyle(fontSize: rs.sp(14), color: textSub),
                  ),
                  SizedBox(height: rs.h(24)),

                  // Infirmary Note
                  Container(
                    padding: EdgeInsets.all(rs.w(14)),
                    decoration: BoxDecoration(
                      color: const Color(0xFFE2EBE1),
                      borderRadius: BorderRadius.circular(rs.r(16)),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.info_outline,
                          size: rs.w(18),
                          color: primaryGreen,
                        ),
                        SizedBox(width: rs.w(10)),
                        Expanded(
                          child: Text(
                            'Clinical data (blood type, allergies, conditions) must be verified and updated in-person by PSU Clinic Staff.',
                            style: TextStyle(
                              fontSize: rs.sp(12),
                              color: const Color(0xFF424943),
                              height: 1.35,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  SizedBox(height: rs.h(24)),

                  Text(
                    'My Contact Phone',
                    style: TextStyle(
                      fontSize: rs.sp(13),
                      fontWeight: FontWeight.w700,
                      color: textMain,
                    ),
                  ),
                  SizedBox(height: rs.h(8)),
                  TextFormField(
                    controller: _phoneController,
                    keyboardType: TextInputType.phone,
                    style: TextStyle(fontSize: rs.sp(14)),
                    decoration: _pillInputDecoration(
                      rs: rs,
                      hint: '09XXXXXXXXX',
                      icon: Icons.phone_outlined,
                    ),
                  ),
                  SizedBox(height: rs.h(20)),

                  Text(
                    'Designated Emergency Contact Person',
                    style: TextStyle(
                      fontSize: rs.sp(13),
                      fontWeight: FontWeight.w700,
                      color: textMain,
                    ),
                  ),
                  SizedBox(height: rs.h(8)),
                  TextFormField(
                    controller: _emContactNameController,
                    style: TextStyle(fontSize: rs.sp(14)),
                    decoration: _pillInputDecoration(
                      rs: rs,
                      hint: 'e.g. Maria Movida (Mother)',
                      icon: Icons.person_outline,
                    ),
                  ),
                  SizedBox(height: rs.h(20)),

                  Text(
                    'Emergency Contact Phone',
                    style: TextStyle(
                      fontSize: rs.sp(13),
                      fontWeight: FontWeight.w700,
                      color: textMain,
                    ),
                  ),
                  SizedBox(height: rs.h(8)),
                  TextFormField(
                    controller: _emContactPhoneController,
                    keyboardType: TextInputType.phone,
                    style: TextStyle(fontSize: rs.sp(14)),
                    decoration: _pillInputDecoration(
                      rs: rs,
                      hint: '09XXXXXXXXX',
                      icon: Icons.phone_in_talk_outlined,
                    ),
                  ),
                  SizedBox(height: rs.h(32)),

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
                      onPressed: _isSaving ? null : _saveProfile,
                      child: _isSaving
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2,
                              ),
                            )
                          : Text(
                              'Save contact changes',
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