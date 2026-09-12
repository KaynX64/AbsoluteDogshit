import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../config/api_config.dart';
import 'login_screen.dart';

class PatientPortalScreen extends StatefulWidget {
  final Map<String, dynamic> user;
  const PatientPortalScreen({super.key, required this.user});

  @override
  State<PatientPortalScreen> createState() => _PatientPortalScreenState();
}

class _PatientPortalScreenState extends State<PatientPortalScreen> {
  int _currentIndex = 0;
  final _storage = const FlutterSecureStorage();

  String _qrToken = '';
  bool _loadingQR = false;

  Map<String, dynamic>? _profileData;
  bool _loadingProfile = false;

  @override
  void initState() {
    super.initState();
    _fetchQRPass();
    _fetchProfile();
  }

  Future<void> _fetchQRPass() async {
    setState(() => _loadingQR = true);
    final token = await _storage.read(key: 'jwt_token');
    try {
      final res = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/api/health-pass/token'),
        headers: {'Authorization': 'Bearer $token'},
      );
      if (res.statusCode == 200) {
        setState(() => _qrToken = jsonDecode(res.body)['qrToken']);
      }
    } catch (_) {}
    setState(() => _loadingQR = false);
  }

  Future<void> _fetchProfile() async {
    setState(() => _loadingProfile = true);
    final token = await _storage.read(key: 'jwt_token');
    try {
      final res = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/api/profile/me'),
        headers: {'Authorization': 'Bearer $token'},
      );
      if (res.statusCode == 200) {
        setState(() => _profileData = jsonDecode(res.body));
      }
    } catch (_) {}
    setState(() => _loadingProfile = false);
  }

  @override
  Widget build(BuildContext context) {
    final tabs = [
      _buildQRPassTab(),
      _buildProfileTab(),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text('Valetudo | ${widget.user['first_name']}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await _storage.delete(key: 'jwt_token');
              if (!context.mounted) return;
              Navigator.pushReplacement(
                context, 
                MaterialPageRoute(builder: (_) => const LoginScreen()),
              );
            },
          )
        ],
      ),
      body: tabs[_currentIndex],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (idx) => setState(() => _currentIndex = idx),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.qr_code_2), label: 'Health Pass'),
          NavigationDestination(icon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }

  Widget _buildQRPassTab() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('PSU Campus Health Pass', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            const Text('Present this QR code to the clinic nurse for touchless triage.', textAlign: TextAlign.center),
            const SizedBox(height: 24),
            _loadingQR
                ? const CircularProgressIndicator()
                : _qrToken.isNotEmpty
                    ? Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), boxShadow: const [BoxShadow(blurRadius: 8, color: Colors.black12)]),
                        child: QrImageView(data: _qrToken, version: QrVersions.auto, size: 220),
                      )
                    : const Text('Failed to load pass.'),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: _fetchQRPass,
              icon: const Icon(Icons.refresh),
              label: const Text('Refresh Pass'),
            )
          ],
        ),
      ),
    );
  }

  Widget _buildProfileTab() {
    if (_loadingProfile) return const Center(child: CircularProgressIndicator());
    if (_profileData == null) return const Center(child: Text('Unable to load profile.'));

    final hp = _profileData!['healthProfile'] ?? {};
    final u = _profileData!['user'] ?? {};

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Card(
          child: ListTile(
            leading: const CircleAvatar(child: Icon(Icons.person)),
            title: Text('${u['first_name']} ${u['last_name']}'),
            subtitle: Text('Student No: ${u['student_no'] ?? 'N/A'}\nCourse: ${u['course'] ?? 'N/A'}'),
          ),
        ),
        const SizedBox(height: 12),
        const Text('Medical Indicators', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        ListTile(title: const Text('Blood Type'), trailing: Text(hp['blood_type'] ?? 'Unrecorded', style: const TextStyle(fontWeight: FontWeight.bold))),
        ListTile(title: const Text('Allergies'), subtitle: Text(hp['allergies'] ?? 'None')),
        ListTile(title: const Text('Chronic Conditions'), subtitle: Text(hp['chronic_conditions'] ?? 'None reported')),
        ListTile(
          title: const Text('Emergency Contact'),
          subtitle: Text('${hp['emergency_contact_name'] ?? 'N/A'} (${hp['emergency_contact_phone'] ?? 'N/A'})'),
        ),
      ],
    );
  }
}