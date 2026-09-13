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

  // --- SOS Logic ---
  void _startHold() {
    setState(() {
      _isHolding = true;
      _holdProgress = 0.0;
      _sosStatusMessage = 'Hold button to broadcast SOS...';
    });

    const step = 50; // ms
    const totalDuration = 2500; // 2.5 seconds hold
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
      // 1. Verify and request GPS permission
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          setState(() {
            _isDispatchingSOS = false;
            _sosStatusMessage = 'Location permission denied. Cannot send GPS SOS.';
          });
          return;
        }
      }

      // 2. Fetch coordinates (falls back to campus approximate if emulator)
      Position position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );

      setState(() => _sosStatusMessage = 'Broadcasting alert to clinic...');

      // 3. Transmit to backend
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
          'notes': 'Urgent campus incident triggered via Mobile Panic Button',
        }),
      );

      final data = jsonDecode(res.body);

      if (res.statusCode == 201) {
        setState(() {
          _sosStatusMessage = 'EMERGENCY DISPATCHED!\nClinic and Quick Response alerted.';
        });
        if (mounted) {
          _showEmergencyDialog();
        }
      } else {
        setState(() => _sosStatusMessage = 'Failed: ${data['error'] ?? 'Server error'}');
      }
    } catch (e) {
      setState(() => _sosStatusMessage = 'SOS Network Error: $e');
    } finally {
      setState(() => _isDispatchingSOS = false);
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
          'Your GPS coordinates and medical profile have been broadcasted to the PSU Infirmary and Response team. Stay where you are if safe.',
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
    final tabs = [
      _buildQRPassTab(),
      _buildSOSTab(),
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
          NavigationDestination(icon: Icon(Icons.emergency_share, color: Colors.red), label: 'SOS Panic'),
          NavigationDestination(icon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }

  // --- TAB 1: QR HEALTH PASS ---
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

  // --- TAB 2: SOS PANIC BUTTON ---
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
                          color: Colors.red.withValues(alpha: 0.4),
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

  // --- TAB 3: HEALTH PROFILE ---
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