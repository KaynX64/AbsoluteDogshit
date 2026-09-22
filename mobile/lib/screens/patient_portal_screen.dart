// mobile/lib/screens/patient_portal_screen.dart
import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:geolocator/geolocator.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config/api_config.dart';
import '../widgets/session_timeout_listener.dart';
import '../services/emergency_alert_service.dart';
import 'login_screen.dart';
import 'edit_profile_screen.dart';
import 'consultation_scheduler_screen.dart';
import 'documents_viewer_screen.dart';

class PatientPortalScreen extends StatefulWidget {
  final Map<String, dynamic> user;
  const PatientPortalScreen({super.key, required this.user});

  @override
  State<PatientPortalScreen> createState() => _PatientPortalScreenState();
}

class _PatientPortalScreenState extends State<PatientPortalScreen> {
  int _currentIndex = 0;
  final _storage = const FlutterSecureStorage();

  // QR Pass State
  String _qrToken = '';
  bool _loadingQR = false;

  // Profile State
  Map<String, dynamic>? _profileData;
  bool _loadingProfile = false;

  // Privacy & Consent State (R.A. 10173)
  bool _hasConsented = false;
  Map<String, dynamic>? _consentDetails;
  bool _isCheckingConsent = false;

  // Live Queue Ticket State
  Map<String, dynamic>? _activeQueueTicket;
  bool _loadingQueue = false;
  Timer? _queuePollingTimer;
  io.Socket? _socket;
  String _previousQueueStatus = '';

  // Emergency SOS State
  bool _isHolding = false;
  double _holdProgress = 0.0;
  Timer? _holdTimer;
  bool _isDispatchingSOS = false;
  String _sosStatusMessage = '';

  @override
  void initState() {
    super.initState();
    // 1. Mandatory R.A. 10173 Consent Gatekeeper
    _checkPrivacyConsent();

    // 2. Fetch Initial Clinical Data
    _fetchQRPass();
    _fetchProfile();
    _fetchActiveQueueTicket();

    // 3. Connect WebSocket for Realtime Queue Events
    _initQueueSocket();

    // 4. Polling Fallback (every 6 seconds)
    _queuePollingTimer = Timer.periodic(
      const Duration(seconds: 6),
      (_) => _fetchActiveQueueTicket(silent: true),
    );
  }

  @override
  void dispose() {
    _queuePollingTimer?.cancel();
    _holdTimer?.cancel();
    _socket?.disconnect();
    super.dispose();
  }

  // ===========================================================================
  // 1. DATA PRIVACY (R.A. 10173) CONSENT MANAGEMENT
  // ===========================================================================

  Future<void> _checkPrivacyConsent() async {
    setState(() => _isCheckingConsent = true);
    final token = await _storage.read(key: 'jwt_token');

    try {
      final res = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/api/privacy/status'),
        headers: {'Authorization': 'Bearer $token'},
      );

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final consented = data['hasConsented'] == true;

        if (mounted) {
          setState(() {
            _hasConsented = consented;
            _consentDetails = data['details'];
          });

          // Gatekeeper: If user has not consented, prompt immediately
          if (!consented) {
            _showConsentModal(isMandatory: true);
          }
        }
      }
    } catch (_) {}

    if (mounted) setState(() => _isCheckingConsent = false);
  }

  Future<void> _recordConsent() async {
    final token = await _storage.read(key: 'jwt_token');
    try {
      final res = await http.post(
        Uri.parse('${ApiConfig.baseUrl}/api/privacy/consent'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
        body: jsonEncode({
          'consent_type': 'PHI_PROCESSING_RA_10173',
          'is_granted': true,
        }),
      );

      if (res.statusCode == 200) {
        setState(() => _hasConsented = true);

        // Immediately populate clinical data now that consent is recorded
        await _fetchQRPass();
        await _fetchProfile();
        await _fetchActiveQueueTicket();

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Privacy consent recorded under R.A. 10173. Access restored.'),
              backgroundColor: Color(0xFF0F766E),
            ),
          );
        }
      }
    } catch (_) {}
  }

  Future<void> _revokeConsent() async {
    final token = await _storage.read(key: 'jwt_token');
    try {
      final res = await http.post(
        Uri.parse('${ApiConfig.baseUrl}/api/privacy/revoke'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
      );

      if (res.statusCode == 200) {
        await _storage.deleteAll();
        if (mounted) {
          Navigator.pushAndRemoveUntil(
            context,
            MaterialPageRoute(builder: (_) => const LoginScreen()),
            (route) => false,
          );
        }
      }
    } catch (_) {}
  }

  void _showConsentModal({bool isMandatory = false}) {
    showDialog(
      context: context,
      barrierDismissible: !isMandatory,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(
          children: [
            Icon(Icons.privacy_tip_outlined, color: Color(0xFF0F766E)),
            SizedBox(width: 8),
            Expanded(
              child: Text(
                'Data Privacy Notice',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
        content: const SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Republic Act No. 10173 (Philippine Data Privacy Act of 2012)',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 12,
                  color: Color(0xFF0F766E),
                ),
              ),
              SizedBox(height: 10),
              Text(
                'Pangasinan State University Infirmary collects, stores, and processes your Protected Health Information (PHI)—including clinical baseline vitals, medical diagnoses, allergies, and real-time emergency coordinates—for the following purposes:\n\n'
                '1. Clinical consultation booking, triage intake, and EMR documentation.\n'
                '2. Dispatching university quick-response personnel during SOS emergencies.\n'
                '3. Issuing tamper-proof e-prescriptions and verifiable clearances.\n\n'
                'Security Commitments:\n'
                '• All medical records are encrypted at rest (AES-256-GCM) and in transit (TLS/HSTS).\n'
                '• Records are subject to a statutory 5-year clinical retention lifecycle.\n'
                '• Access is monitored through immutable, SHA-256 hash-chained audit trails.',
                style: TextStyle(fontSize: 12, height: 1.5, color: Colors.black87),
              ),
            ],
          ),
        ),
        actions: [
          if (isMandatory)
            TextButton(
              onPressed: () async {
                await _storage.deleteAll();
                if (ctx.mounted) {
                  Navigator.pushAndRemoveUntil(
                    context,
                    MaterialPageRoute(builder: (_) => const LoginScreen()),
                    (route) => false,
                  );
                }
              },
              child: const Text('Decline (Exit)', style: TextStyle(color: Colors.red)),
            )
          else
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Close'),
            ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0F766E),
              foregroundColor: Colors.white,
            ),
            onPressed: () async {
              Navigator.pop(ctx);
              await _recordConsent();
            },
            child: const Text('Agree & Consent'),
          ),
        ],
      ),
    );
  }

  // ===========================================================================
  // 2. REAL-TIME QUEUE & WEBSOCKET ENGINE
  // ===========================================================================

  Future<void> _initQueueSocket() async {
    final token = await _storage.read(key: 'jwt_token');
    try {
      _socket = io.io(
        ApiConfig.socketUrl,
        io.OptionBuilder()
            .setTransports(['websocket', 'polling'])
            .setAuth({'token': token})
            .enableAutoConnect()
            .build(),
      );

      _socket?.on('queue:updated', (_) {
        _fetchActiveQueueTicket(silent: true);
      });
    } catch (_) {}
  }

  Future<void> _fetchActiveQueueTicket({bool silent = false}) async {
    if (!silent) setState(() => _loadingQueue = true);
    final token = await _storage.read(key: 'jwt_token');

    try {
      final res = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/api/appointments/queue/my'),
        headers: {'Authorization': 'Bearer $token'},
      );

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (mounted) {
          setState(() {
            if (data['hasActiveTicket'] == true) {
              _activeQueueTicket = data['ticket'];

              final newStatus = _activeQueueTicket?['status'] ?? '';
              if (newStatus == 'in-consultation' && _previousQueueStatus == 'waiting') {
                EmergencyAlertService().showQueueTurnNotification(
                  ticketNo: _activeQueueTicket?['ticket_no'] ?? 'Your Ticket',
                  doctorName: _activeQueueTicket?['doctor_name'] ?? 'Attending Doctor',
                );
              }
              _previousQueueStatus = newStatus;
            } else {
              _activeQueueTicket = null;
              _previousQueueStatus = '';
            }
          });
        }
      }
    } catch (_) {}

    if (!silent && mounted) setState(() => _loadingQueue = false);
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

  // ===========================================================================
  // 3. CAMPUS EMERGENCY SOS LOGIC
  // ===========================================================================

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
          'Your live GPS coordinates and medical profile have been broadcasted to the PSU Infirmary and Quick-Response team.',
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

  // ===========================================================================
  // 4. MAIN BUILD METHOD WITH 15-MIN SESSION TIMEOUT LISTENER
  // ===========================================================================

  @override
  Widget build(BuildContext context) {
    final tabs = [
      _buildQRPassTab(),
      const ConsultationSchedulerScreen(),
      const DocumentsViewerScreen(),
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

    return SessionTimeoutListener(
      timeoutMinutes: 15,
      child: Scaffold(
        appBar: AppBar(
          title: Text(titles[_currentIndex]),
          actions: [
            IconButton(
              icon: const Icon(Icons.logout),
              tooltip: 'Sign Out',
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
      ),
    );
  }

  // ===========================================================================
  // 5. TAB 0: QR HEALTH PASS & ACTIVE CLINIC QUEUE BANNER
  // ===========================================================================

  Widget _buildQRPassTab() {
    return RefreshIndicator(
      onRefresh: () async {
        await _fetchQRPass();
        await _fetchActiveQueueTicket();
      },
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        children: [
          if (_activeQueueTicket != null) ...[
            _buildActiveQueueCard(),
            const SizedBox(height: 20),
          ],
          Card(
            elevation: 2,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            child: Padding(
              padding: const EdgeInsets.all(20.0),
              child: Column(
                children: [
                  const Text(
                    'PSU Campus Health Pass',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF0F766E)),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Present this QR code to clinic staff for touchless intake and queuing.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12, color: Colors.black54),
                  ),
                  const SizedBox(height: 18),
                  _loadingQR
                      ? const SizedBox(
                          height: 200,
                          child: Center(child: CircularProgressIndicator(color: Color(0xFF0F766E))),
                        )
                      : _qrToken.isNotEmpty
                          ? Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: Colors.teal.shade100),
                                boxShadow: const [BoxShadow(blurRadius: 6, color: Colors.black12)],
                              ),
                              child: QrImageView(data: _qrToken, version: QrVersions.auto, size: 200),
                            )
                          : const Text('Failed to load pass.'),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFF0F766E),
                      side: const BorderSide(color: Color(0xFF0F766E)),
                    ),
                    onPressed: () {
                      _fetchQRPass();
                      _fetchActiveQueueTicket();
                    },
                    icon: const Icon(Icons.refresh, size: 16),
                    label: const Text('Refresh Pass & Queue'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActiveQueueCard() {
    final ticket = _activeQueueTicket!;
    final status = ticket['status'] ?? 'waiting';
    final ticketNo = ticket['ticket_no'] ?? 'Q-00';
    final isServing = status == 'in-consultation';
    final patientsAhead = ticket['patients_ahead'] ?? 0;
    final waitMins = ticket['estimated_wait_minutes'] ?? 0;

    final bgColor = isServing ? const Color(0xFFFEF3C7) : const Color(0xFFF0FDFA);
    final borderColor = isServing ? Colors.amber.shade700 : const Color(0xFF0F766E);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: borderColor, width: 2),
        boxShadow: [
          BoxShadow(
            color: borderColor.withAlpha(40),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Icon(
                    isServing ? Icons.notifications_active : Icons.confirmation_number_outlined,
                    color: isServing ? Colors.amber.shade900 : const Color(0xFF0F766E),
                    size: 22,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    isServing ? 'NOW SERVING YOUR TICKET!' : 'ACTIVE CLINIC QUEUE',
                    style: TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 13,
                      color: isServing ? Colors.amber.shade900 : const Color(0xFF0F766E),
                      letterSpacing: 0.5,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: isServing ? Colors.amber.shade700 : const Color(0xFF0F766E),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  isServing ? 'YOUR TURN' : 'WAITING',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          const Divider(height: 18),

          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Your Assigned Ticket', style: TextStyle(fontSize: 12, color: Colors.black54)),
                  Text(
                    ticketNo,
                    style: TextStyle(
                      fontSize: 34,
                      fontWeight: FontWeight.w900,
                      color: isServing ? Colors.amber.shade900 : const Color(0xFF0F766E),
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: borderColor.withAlpha(80)),
                ),
                child: Column(
                  children: [
                    Text(
                      isServing ? 'Proceed To' : 'Patients Ahead',
                      style: const TextStyle(fontSize: 10, color: Colors.black54, fontWeight: FontWeight.bold),
                    ),
                    Text(
                      isServing ? 'Clinic Room 1' : '$patientsAhead',
                      style: TextStyle(
                        fontSize: isServing ? 13 : 20,
                        fontWeight: FontWeight.bold,
                        color: isServing ? Colors.amber.shade900 : Colors.black87,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.white.withAlpha(200),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  "Practitioner: ${ticket['doctor_name']} (${ticket['doc_specialty'] ?? 'Infirmary'})",
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.black87),
                ),
                const SizedBox(height: 2),
                Text(
                  "Purpose: ${ticket['visit_type']} • Checked in: ${ticket['arrival_time']}",
                  style: const TextStyle(fontSize: 11, color: Colors.black54),
                ),
                if (!isServing) ...[
                  const SizedBox(height: 4),
                  Text(
                    "Estimated Wait Time: ~${waitMins > 0 ? waitMins : 5} minutes",
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.teal.shade800),
                  ),
                ],
              ],
            ),
          ),

          if (isServing) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.amber.shade600,
                borderRadius: BorderRadius.circular(6),
              ),
              child: const Text(
                '👉 Please enter the physician consultation area now.',
                style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
                textAlign: TextAlign.center,
              ),
            ),
          ],
        ],
      ),
    );
  }

  // ===========================================================================
  // 6. TAB 3: CAMPUS EMERGENCY SOS
  // ===========================================================================

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

  // ===========================================================================
  // 7. TAB 4: HEALTH PROFILE & R.A. 10173 COMPLIANCE PANEL
  // ===========================================================================

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
      onRefresh: () async {
        await _fetchProfile();
        await _checkPrivacyConsent();
      },
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

          // R.A. 10173 DATA PRIVACY & COMPLIANCE SECTION
          const Text(
            'Data Privacy & Compliance (R.A. 10173)',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Card(
            elevation: 1,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.shield_outlined, color: Color(0xFF0F766E), size: 22),
                          SizedBox(width: 8),
                          Text(
                            'Encrypted at Rest & In Transit',
                            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                          ),
                        ],
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: _hasConsented ? Colors.green.shade50 : Colors.amber.shade50,
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(
                            color: _hasConsented ? Colors.green : Colors.amber.shade800,
                          ),
                        ),
                        child: Text(
                          _hasConsented ? 'CONSENT ACTIVE' : 'PENDING CONSENT',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: _hasConsented ? Colors.green.shade800 : Colors.amber.shade900,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'All diagnoses, prescriptions, and clinical encounters are protected by AES-256-GCM encryption '
                    'and adhere to the Philippine Department of Health (DOH) 5-year data retention policy.',
                    style: TextStyle(fontSize: 12, color: Colors.black54, height: 1.4),
                  ),
                  const Divider(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      TextButton.icon(
                        onPressed: () => _showConsentModal(isMandatory: false),
                        icon: const Icon(Icons.info_outline, size: 16, color: Color(0xFF0F766E)),
                        label: const Text(
                          'View Privacy Terms',
                          style: TextStyle(fontSize: 12, color: Color(0xFF0F766E)),
                        ),
                      ),
                      if (_hasConsented)
                        TextButton(
                          onPressed: () {
                            showDialog(
                              context: context,
                              builder: (ctx) => AlertDialog(
                                title: const Text('Revoke Data Processing Consent?'),
                                content: const Text(
                                  'Revoking consent will suspend your dynamic QR health pass, digital prescriptions, '
                                  'and online consultation bookings as mandated by R.A. 10173.',
                                ),
                                actions: [
                                  TextButton(
                                    onPressed: () => Navigator.pop(ctx),
                                    child: const Text('Cancel'),
                                  ),
                                  ElevatedButton(
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.red,
                                      foregroundColor: Colors.white,
                                    ),
                                    onPressed: () {
                                      Navigator.pop(ctx);
                                      _revokeConsent();
                                    },
                                    child: const Text('Confirm Revocation'),
                                  ),
                                ],
                              ),
                            );
                          },
                          child: const Text(
                            'Revoke Consent',
                            style: TextStyle(fontSize: 12, color: Colors.red),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}