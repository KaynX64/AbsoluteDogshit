// mobile/lib/screens/patient_portal_screen.dart
import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:geolocator/geolocator.dart';
import '../config/api_config.dart';
import 'login_screen.dart';
import 'edit_profile_screen.dart';
import 'consultation_scheduler_screen.dart';
import 'documents_viewer_screen.dart'; // <-- Feature 5 Tab
import '../services/emergency_alert_service.dart';

class PatientPortalScreen extends StatefulWidget {
  final Map<String, dynamic> user;
  const PatientPortalScreen({super.key, required this.user});

  @override
  State<PatientPortalScreen> createState() => _PatientPortalScreenState();
}

class _PatientPortalScreenState extends State<PatientPortalScreen> {
  int _currentIndex = 0;
  final _storage = const FlutterSecureStorage();

  // QR Pass state
  String _qrToken = '';
  bool _loadingQR = false;

  // Profile state
  Map<String, dynamic>? _profileData;
  bool _loadingProfile = false;

  // SOS state
  bool _isHolding = false;
  double _holdProgress = 0.0;
  Timer? _holdTimer;
  bool _isDispatchingSOS = false;
  String _sosStatusMessage = '';

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
    if (mounted) setState(() => _loadingQR = false);
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
    if (mounted) setState(() => _loadingProfile = false);
  }

  void _startHold() {
    setState(() {
      _isHolding = true;
      _holdProgress = 0.0;
      _sosStatusMessage = 'Hold button to broadcast SOS...';
    });

    const step = 50;
    const totalDuration = 2500;
    _holdTimer = Timer.periodic(const Duration(milliseconds: step), (timer) {
      setState(() {
        _holdProgress += step / totalDuration;
        if (_holdProgress >= 1.0) {
          _holdTimer?.cancel();
          _isHolding = false;
          _triggerEmergencySOS();
        }
      });
    });
  }

  void _cancelHold() {
    if (_holdProgress < 1.0) {
      _holdTimer?.cancel();
      setState(() {
        _isHolding = false;
        _holdProgress = 0.0;
        _sosStatusMessage = 'SOS cancelled.';
      });
    }
  }

  Future<void> _triggerEmergencySOS() async {
    setState(() {
      _isDispatchingSOS = true;
      _sosStatusMessage = 'Acquiring GPS location...';
    });

    try {
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          setState(() {
            _isDispatchingSOS = false;
            _sosStatusMessage = 'Location permission denied.';
          });
          return;
        }
      }

      Position position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );

      setState(() => _sosStatusMessage = 'Broadcasting alert to clinic...');

      final token = await _storage.read(key: 'jwt_token');
      final res = await http.post(
        Uri.parse('${ApiConfig.baseUrl}/api/emergency/sos'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
        body: jsonEncode({
          'latitude': position.latitude,
          'longitude': position.longitude,
          'notes': 'Urgent incident triggered via Mobile Panic Button',
        }),
      );

      final data = jsonDecode(res.body);

      if (res.statusCode == 201) {
        setState(() {
          _sosStatusMessage = 'EMERGENCY DISPATCHED!\nClinic and Response team alerted.';
        });

        EmergencyAlertService().showStudentSosSentNotification();

        if (mounted) {
          _showEmergencyDialog();
        }
      } else {
        setState(() => _sosStatusMessage = 'Failed: ${data['error'] ?? 'Server error'}');
      }
    } catch (e) {
      setState(() => _sosStatusMessage = 'SOS Network Error: $e');
    } finally {
      if (mounted) setState(() => _isDispatchingSOS = false);
    }
  }

  void _showEmergencyDialog() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.warning_amber_rounded, color: Colors.red, size: 60),
        title: const Text('SOS Alert Active', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.red)),
        content: const Text(
          'Your live GPS coordinates and health profile have been broadcasted to the PSU Infirmary and Response team.',
          textAlign: TextAlign.center,
        ),
        actions: [
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red, foregroundColor: Colors.white),
            onPressed: () => Navigator.pop(ctx),
            child: const Text('I Understand'),
          )
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // 5 Distinct Tabs matching the SADD
    final tabs = [
      _buildQRPassTab(),
      const ConsultationSchedulerScreen(),
      const DocumentsViewerScreen(), // <-- Feature 5 Tab
      _buildSOSTab(),
      _buildProfileTab(),
    ];

    final titles = [
      'Valetudo | ${widget.user['first_name']}',
      'Consultation Scheduler',
      'Prescriptions & Clearances',
      'Campus Emergency SOS',
      'My Health Profile',
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text(titles[_currentIndex]),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await _storage.delete(key: 'jwt_token');
              await _storage.delete(key: 'user_data');
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
          NavigationDestination(
            icon: Icon(Icons.qr_code_2),
            label: 'Health Pass',
          ),
          NavigationDestination(
            icon: Icon(Icons.calendar_month_outlined),
            selectedIcon: Icon(Icons.calendar_month, color: Color(0xFF0F766E)),
            label: 'Scheduler',
          ),
          NavigationDestination(
            icon: Icon(Icons.description_outlined),
            selectedIcon: Icon(Icons.description, color: Color(0xFF0F766E)),
            label: 'Documents',
          ),
          NavigationDestination(
            icon: Icon(Icons.emergency_share, color: Colors.red),
            label: 'SOS Panic',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person, color: Color(0xFF0F766E)),
            label: 'Profile',
          ),
        ],
      ),
    );
  }

  // --- TAB 0: QR HEALTH PASS ---
  Widget _buildQRPassTab() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('PSU Campus Health Pass', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            const Text('Present this QR code to clinic staff for touchless intake.', textAlign: TextAlign.center),
            const SizedBox(height: 24),
            _loadingQR
                ? const CircularProgressIndicator()
                : _qrToken.isNotEmpty
                    ? Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(12),
                          boxShadow: const [BoxShadow(blurRadius: 8, color: Colors.black12)],
                        ),
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

  // --- TAB 3: SOS PANIC BUTTON ---
  Widget _buildSOSTab() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('CAMPUS EMERGENCY', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.red)),
            const SizedBox(height: 8),
            const Text(
              'Press and HOLD for 2.5 seconds to broadcast your live GPS location & medical profile to the clinic response team.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.black54),
            ),
            const SizedBox(height: 36),
            Stack(
              alignment: Alignment.center,
              children: [
                SizedBox(
                  width: 190,
                  height: 190,
                  child: CircularProgressIndicator(
                    value: _holdProgress,
                    strokeWidth: 8,
                    valueColor: const AlwaysStoppedAnimation<Color>(Colors.red),
                    backgroundColor: Colors.red.shade100,
                  ),
                ),
                GestureDetector(
                  onTapDown: (_) => _startHold(),
                  onTapUp: (_) => _cancelHold(),
                  onTapCancel: () => _cancelHold(),
                  child: Container(
                    width: 160,
                    height: 160,
                    decoration: BoxDecoration(
                      color: _isHolding ? Colors.red.shade800 : Colors.red,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: Colors.red.withAlpha(102),
                          blurRadius: 20,
                          spreadRadius: 4,
                        ),
                      ],
                    ),
                    child: Center(
                      child: _isDispatchingSOS
                          ? const CircularProgressIndicator(color: Colors.white)
                          : const Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.warning_rounded, color: Colors.white, size: 50),
                                SizedBox(height: 4),
                                Text(
                                  'HOLD SOS',
                                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18),
                                ),
                              ],
                            ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 36),
            Text(
              _sosStatusMessage,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontWeight: FontWeight.bold,
                color: _sosStatusMessage.contains('DISPATCHED') ? Colors.green : Colors.red.shade700,
              ),
            ),
          ],
        ),
      ),
    );
  }

  // --- TAB 4: HEALTH PROFILE ---
  Widget _buildProfileTab() {
    if (_loadingProfile) return const Center(child: CircularProgressIndicator());
    if (_profileData == null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('Unable to load health profile.'),
            const SizedBox(height: 12),
            ElevatedButton(onPressed: _fetchProfile, child: const Text('Retry')),
          ],
        ),
      );
    }

    final hp = _profileData!['healthProfile'] ?? {};
    final u = _profileData!['user'] ?? {};

    List<String> immunizations = [];
    final rawImm = hp['immunization_history'];
    if (rawImm is List) {
      immunizations = rawImm.map((e) => e.toString()).toList();
    } else if (rawImm is String && rawImm.isNotEmpty) {
      try {
        final decoded = jsonDecode(rawImm);
        if (decoded is List) immunizations = decoded.map((e) => e.toString()).toList();
      } catch (_) {
        immunizations = [rawImm];
      }
    }

    return RefreshIndicator(
      onRefresh: _fetchProfile,
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Card(
            elevation: 2,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 30,
                    backgroundColor: Colors.teal.shade100,
                    child: const Icon(Icons.person, size: 36, color: Colors.teal),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${u['first_name']} ${u['last_name']}',
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                        ),
                        Text(
                          'ID: ${u['student_no'] ?? 'Staff/Faculty'}',
                          style: const TextStyle(color: Colors.black54),
                        ),
                        Text(
                          'Dept/Course: ${u['course'] ?? u['department'] ?? 'PSU Lingayen'}',
                          style: const TextStyle(color: Colors.black54),
                        ),
                        if (u['phone'] != null)
                          Text(
                            'Phone: ${u['phone']}',
                            style: const TextStyle(color: Colors.black87, fontSize: 13),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Clinical Indicators',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              OutlinedButton.icon(
                onPressed: () async {
                  final updated = await Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => EditProfileScreen(
                        user: u,
                        healthProfile: hp,
                      ),
                    ),
                  );
                  if (updated == true) {
                    _fetchProfile();
                  }
                },
                icon: const Icon(Icons.edit, size: 18),
                label: const Text('Edit Contacts'),
              ),
            ],
          ),
          const SizedBox(height: 8),

          Card(
            elevation: 1,
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.bloodtype, color: Colors.red),
                  title: const Text('Blood Type'),
                  trailing: Text(
                    hp['blood_type'] ?? 'Unrecorded',
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.straighten, color: Colors.blue),
                  title: const Text('Height & Weight'),
                  subtitle: Text(
                    '${hp['height'] != null ? '${hp['height']} cm' : 'Height: N/A'} • '
                    '${hp['weight'] != null ? '${hp['weight']} kg' : 'Weight: N/A'}',
                  ),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.warning_amber_rounded, color: Colors.orange),
                  title: const Text('Allergies'),
                  subtitle: Text(
                    hp['allergies'] ?? 'None recorded',
                    style: TextStyle(
                      color: (hp['allergies'] != null && hp['allergies'].toString().isNotEmpty)
                          ? Colors.red
                          : Colors.black87,
                      fontWeight: (hp['allergies'] != null && hp['allergies'].toString().isNotEmpty)
                          ? FontWeight.bold
                          : FontWeight.normal,
                    ),
                  ),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.medical_information_outlined, color: Colors.purple),
                  title: const Text('Chronic Conditions'),
                  subtitle: Text(hp['chronic_conditions'] ?? 'None reported'),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.contact_phone, color: Colors.teal),
                  title: const Text('Emergency Contact'),
                  subtitle: Text(
                    '${hp['emergency_contact_name'] ?? 'Not provided'}\n'
                    '${hp['emergency_contact_phone'] ?? 'No contact phone'}',
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          const Text(
            'Immunization History',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Card(
            elevation: 1,
            child: Padding(
              padding: const EdgeInsets.all(14.0),
              child: immunizations.isEmpty
                  ? const Text(
                      'No immunization records added yet. Verified by Clinic upon physical intake.',
                      style: TextStyle(color: Colors.black54),
                    )
                  : Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: immunizations.map((vaccine) {
                        return Chip(
                          avatar: const Icon(Icons.check_circle, color: Colors.teal, size: 18),
                          label: Text(vaccine),
                          backgroundColor: Colors.teal.shade50,
                        );
                      }).toList(),
                    ),
            ),
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }
}