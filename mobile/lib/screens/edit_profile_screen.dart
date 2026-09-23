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
            content: Text('Contact and emergency info updated successfully!'),
            backgroundColor: Colors.teal,
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
      SnackBar(content: Text(message), backgroundColor: Colors.red),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Edit Emergency Contacts'),
      ),
      body: _isSaving
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  const Card(
                    color: Color(0xFFF0FDFA),
                    child: Padding(
                      padding: EdgeInsets.all(12.0),
                      child: Text(
                        'Clinical data (Blood type, Allergies, Vaccines) must be verified and updated in-person by PSU Clinic Staff.',
                        style: TextStyle(color: Colors.teal, fontSize: 13),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Personal Contact',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.teal),
                  ),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _phoneController,
                    decoration: const InputDecoration(
                      labelText: 'My Contact Phone Number',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.phone),
                    ),
                    keyboardType: TextInputType.phone,
                  ),
                  const SizedBox(height: 20),
                  const Text(
                    'Designated Emergency Contact',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.teal),
                  ),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _emContactNameController,
                    decoration: const InputDecoration(
                      labelText: 'Emergency Contact Person',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.person_pin),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _emContactPhoneController,
                    decoration: const InputDecoration(
                      labelText: 'Emergency Contact Phone Number',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.phone_in_talk),
                    ),
                    keyboardType: TextInputType.phone,
                  ),
                  const SizedBox(height: 28),
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.teal,
                      foregroundColor: Colors.white,
                      minimumSize: const Size.fromHeight(50),
                    ),
                    onPressed: _saveProfile,
                    icon: const Icon(Icons.save),
                    label: const Text('Save Changes', style: TextStyle(fontSize: 16)),
                  ),
                ],
              ),
            ),
    );
  }
}