// mobile/lib/screens/edit_profile_screen.dart
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';

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
    _emContactNameController = TextEditingController(text: hp['emergency_contact_name'] ?? '');
    _emContactPhoneController = TextEditingController(text: hp['emergency_contact_phone'] ?? '');
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
        title: const Text('Back to profile', style: TextStyle(fontSize: 14, color: textMain, fontWeight: FontWeight.w600)),
        titleSpacing: -6,
      ),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 12.0),
            children: [
              const Text('KEEP IN TOUCH', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, letterSpacing: 1.8, color: textSub)),
              const SizedBox(height: 6),
              const Text('Edit contact details.', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: textMain, letterSpacing: -0.5)),
              const SizedBox(height: 4),
              const Text('Keep your personal and emergency contacts updated.', style: TextStyle(fontSize: 14, color: textSub)),
              const SizedBox(height: 24),

              // Infirmary Note
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: const Color(0xFFE2EBE1), borderRadius: BorderRadius.circular(16)),
                child: const Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.info_outline, size: 18, color: primaryGreen),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Clinical data (blood type, allergies, conditions) must be verified and updated in-person by PSU Clinic Staff.',
                        style: TextStyle(fontSize: 12, color: Color(0xFF424943), height: 1.35),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              const Text('My Contact Phone', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: textMain)),
              const SizedBox(height: 8),
              TextFormField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                style: const TextStyle(fontSize: 14),
                decoration: _pillInputDecoration('09XXXXXXXXX', Icons.phone_outlined),
              ),
              const SizedBox(height: 20),

              const Text('Designated Emergency Contact Person', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: textMain)),
              const SizedBox(height: 8),
              TextFormField(
                controller: _emContactNameController,
                style: const TextStyle(fontSize: 14),
                decoration: _pillInputDecoration('e.g. Maria Movida (Mother)', Icons.person_outline),
              ),
              const SizedBox(height: 20),

              const Text('Emergency Contact Phone', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: textMain)),
              const SizedBox(height: 8),
              TextFormField(
                controller: _emContactPhoneController,
                keyboardType: TextInputType.phone,
                style: const TextStyle(fontSize: 14),
                decoration: _pillInputDecoration('09XXXXXXXXX', Icons.phone_in_talk_outlined),
              ),
              const SizedBox(height: 32),

              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: primaryGreen,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: const StadiumBorder(),
                  ),
                  onPressed: _isSaving ? null : _saveProfile,
                  child: _isSaving
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text('Save contact changes', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  InputDecoration _pillInputDecoration(String hint, IconData icon) {
    return InputDecoration(
      hintText: hint,
      prefixIcon: Icon(icon, size: 18, color: textSub),
      hintStyle: const TextStyle(color: Color(0xFF94A396), fontSize: 14),
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: const BorderSide(color: borderColor)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: const BorderSide(color: borderColor)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: const BorderSide(color: primaryGreen, width: 1.5)),
    );
  }
}