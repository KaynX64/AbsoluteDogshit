// mobile/lib/screens/patient_portal_screen.dart
import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:geolocator/geolocator.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:url_launcher/url_launcher.dart';

import '../config/api_config.dart';
import '../widgets/session_timeout_listener.dart';
import '../widgets/valetudo_logo.dart';
import '../services/emergency_alert_service.dart';
import 'login_screen.dart';
import 'edit_profile_screen.dart';
import 'consultation_scheduler_screen.dart';
import 'documents_viewer_screen.dart';
import 'change_password_screen.dart';

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

  // Live Queue Ticket State
  Map<String, dynamic>? _activeQueueTicket;
  Timer? _queuePollingTimer;
  io.Socket? _socket;
  String _previousQueueStatus = '';

  // Emergency SOS State
  bool _sosConsent = false;
  bool _isHolding = false;
  final ValueNotifier<double> _holdProgressNotifier = ValueNotifier<double>(0.0);
  Timer? _holdTimer;
  bool _isDispatchingSOS = false;
  String _sosStatusMessage = '';

  @override
  void initState() {
    super.initState();
    _checkPrivacyConsent();
    _fetchQRPass();
    _fetchProfile();
    _fetchActiveQueueTicket();
    _initQueueSocket();

    _queuePollingTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _fetchActiveQueueTicket(silent: true),
    );
  }

  @override
  void dispose() {
    _queuePollingTimer?.cancel();
    _holdTimer?.cancel();
    _holdProgressNotifier.dispose();
    _socket?.disconnect();
    super.dispose();
  }

  // ===========================================================================
  // 1. DATA PRIVACY (R.A. 10173) CONSENT MANAGEMENT
  // ===========================================================================

  Future<void> _checkPrivacyConsent() async {
    final token = await _storage.read(key: 'jwt_token');

    try {
      final res = await ApiConfig.client.get(
        Uri.parse('${ApiConfig.baseUrl}/api/privacy/status'),
        headers: {'Authorization': 'Bearer $token'},
      );

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final consented = data['hasConsented'] == true;

        if (mounted) {
          setState(() => _hasConsented = consented);
          if (!consented) {
            _showConsentModal(isMandatory: true);
          }
        }
      }
    } catch (_) {}
  }

  Future<void> _recordConsent() async {
    final token = await _storage.read(key: 'jwt_token');
    try {
      final res = await ApiConfig.client.post(
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
        await _fetchQRPass();
        await _fetchProfile();
        await _fetchActiveQueueTicket();

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Privacy consent recorded under R.A. 10173. Access restored.'),
              backgroundColor: Color(0xFF284E3A),
            ),
          );
        }
      }
    } catch (_) {}
  }

  Future<void> _revokeConsent() async {
    final token = await _storage.read(key: 'jwt_token');
    try {
      final res = await ApiConfig.client.post(
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
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        backgroundColor: Colors.white,
        title: const Row(
          children: [
            Icon(Icons.privacy_tip_outlined, color: Color(0xFF284E3A)),
            SizedBox(width: 8),
            Expanded(
              child: Text(
                'Data Privacy Notice',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
              ),
            ),
          ],
        ),
        content: const SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Republic Act No. 10173 (Data Privacy Act of 2012)',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 12,
                  color: Color(0xFF284E3A),
                ),
              ),
              SizedBox(height: 10),
              Text(
                'Pangasinan State University Infirmary collects and processes your Protected Health Information (PHI) '
                'for clinical consultation, emergency dispatch, and digital certification.\n\n'
                '• All clinical data is encrypted with AES-256-GCM.\n'
                '• Stored under statutory 5-year retention lifecycle.\n'
                '• Access monitored with immutable SHA-256 hash chains.',
                style: TextStyle(fontSize: 12.5, height: 1.5, color: Color(0xFF5A635B)),
              ),
            ],
          ),
        ),
        actions: [
          if (isMandatory)
            TextButton(
              onPressed: () async {
                await _storage.deleteAll();
                if (mounted) {
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
              backgroundColor: const Color(0xFF284E3A),
              foregroundColor: Colors.white,
              shape: const StadiumBorder(),
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

  void _showRevokeDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        backgroundColor: Colors.white,
        title: const Text('Revoke Consent?', style: TextStyle(fontWeight: FontWeight.w800, color: Color(0xFF7A2E26))),
        content: const Text(
          'Under R.A. 10173, revoking consent will suspend your access to digital health passes, prescriptions, and online scheduling.',
          style: TextStyle(fontSize: 13, color: Color(0xFF5A635B)),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF7A2E26),
              foregroundColor: Colors.white,
              shape: const StadiumBorder(),
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
    final token = await _storage.read(key: 'jwt_token');

    try {
      final res = await ApiConfig.client.get(
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
  }

  Future<void> _fetchQRPass() async {
    setState(() => _loadingQR = true);
    final token = await _storage.read(key: 'jwt_token');
    try {
      final res = await ApiConfig.client.get(
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
      final res = await ApiConfig.client.get(
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
  // 3. DIALER & EMERGENCY SOS
  // ===========================================================================

  Future<void> _launchDialer(String number) async {
    final Uri uri = Uri(scheme: 'tel', path: number);
    try {
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        await launchUrl(uri);
      }
    } catch (e) {
      debugPrint('[Dialer Error]: $e');
    }
  }

  void _startHold() {
    // Prevent re-triggering while a dispatch is already in flight.
    if (_isDispatchingSOS) return;

    if (!_sosConsent) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please check the consent box before triggering SOS.'),
          backgroundColor: Color(0xFF7A2E26),
        ),
      );
      return;
    }

    _isHolding = true;
    _holdProgressNotifier.value = 0.0;
    setState(() {
      _sosStatusMessage = 'Broadcasting location...';
    });

    const step = 50;
    const totalDuration = 2500;
    _holdTimer = Timer.periodic(const Duration(milliseconds: step), (timer) {
      final next = _holdProgressNotifier.value + (step / totalDuration);
      if (next >= 1.0) {
        _holdProgressNotifier.value = 1.0;
        _holdTimer?.cancel();
        _isHolding = false;
        _triggerEmergencySOS();
      } else {
        _holdProgressNotifier.value = next;
      }
    });
  }

  void _cancelHold() {
    if (_holdProgressNotifier.value < 1.0) {
      _holdTimer?.cancel();
      _isHolding = false;
      _holdProgressNotifier.value = 0.0;
      setState(() {
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

      setState(() => _sosStatusMessage = 'Broadcasting alert to clinic responders...');

      final token = await _storage.read(key: 'jwt_token');
      final res = await ApiConfig.client.post(
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
          _sosStatusMessage = 'EMERGENCY DISPATCHED!\nCampus response team alerted.';
        });

        EmergencyAlertService().showStudentSosSentNotification();

        if (mounted) {
          _showEmergencyConfirmationDialog();
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

  void _showEmergencyConfirmationDialog() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        icon: const Icon(Icons.check_circle_outline, color: Color(0xFF284E3A), size: 54),
        title: const Text(
          'SOS Alert Active',
          style: TextStyle(fontWeight: FontWeight.w800, color: Color(0xFF284E3A)),
        ),
        content: const Text(
          'Your live GPS coordinates and medical profile have been securely transmitted to the PSU Infirmary and campus quick-response unit.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13.5, color: Color(0xFF5A635B), height: 1.4),
        ),
        actions: [
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF284E3A),
              foregroundColor: Colors.white,
              shape: const StadiumBorder(),
            ),
            onPressed: () => Navigator.pop(ctx),
            child: const Text('I Understand'),
          ),
        ],
      ),
    );
  }

  Future<void> _handleSignOut() async {
    await _storage.delete(key: 'jwt_token');
    await _storage.delete(key: 'user_data');
    if (!mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  String _getInitials(String firstName, String lastName) {
    final f = firstName.isNotEmpty ? firstName[0].toUpperCase() : '';
    final l = lastName.isNotEmpty ? lastName[0].toUpperCase() : '';
    return '$f$l'.isEmpty ? 'PS' : '$f$l';
  }

  // Format a raw timestamp as "Xmo ago (YYYY-MM-DD)" for the profile freshness chip.
  String _formatRelativeDate(String? raw) {
    if (raw == null || raw.isEmpty) return 'Unknown';
    try {
      final dt = DateTime.parse(raw).toLocal();
      final diff = DateTime.now().difference(dt);
      final dateStr =
          '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';

      if (diff.inDays < 1) return 'Today ($dateStr)';
      if (diff.inDays < 7) return '${diff.inDays}d ago ($dateStr)';
      if (diff.inDays < 365) return '${(diff.inDays / 30).floor()}mo ago ($dateStr)';
      return '${(diff.inDays / 365).toStringAsFixed(1)}y ago ($dateStr)';
    } catch (_) {
      return raw;
    }
  }

  // ===========================================================================
  // 4. MAIN BUILD
  // ===========================================================================

  @override
  Widget build(BuildContext context) {
    const primaryGreen = Color(0xFF284E3A);
    final firstName = widget.user['first_name'] ?? 'User';
    final lastName = widget.user['last_name'] ?? '';
    final initials = _getInitials(firstName, lastName);

    final tabs = [
      _buildOverviewTab(firstName),
      const ConsultationSchedulerScreen(),
      _buildSOSTab(),
      const DocumentsViewerScreen(),
      _buildProfileTab(initials),
    ];

    return SessionTimeoutListener(
      timeoutMinutes: 480,
      child: Scaffold(
        backgroundColor: const Color(0xFFF7F9F6),
        appBar: PreferredSize(
          preferredSize: const Size.fromHeight(64),
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 8.0),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      const ValetudoLogo(size: 34),
                      const SizedBox(width: 8),
                      const Text(
                        'valetudo.',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w900,
                          color: Color(0xFF191C1A),
                          letterSpacing: -0.5,
                        ),
                      ),
                    ],
                  ),
                  Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: const BoxDecoration(
                          color: Color(0xFFE5EDE4),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.notifications_none_rounded, size: 20, color: primaryGreen),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        width: 36,
                        height: 36,
                        decoration: const BoxDecoration(
                          color: Color(0xFFE6DDCF),
                          shape: BoxShape.circle,
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          initials,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            color: Color(0xFF4A4133),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
        body: tabs[_currentIndex],
        bottomNavigationBar: _buildCustomBottomNav(),
      ),
    );
  }

  // ===========================================================================
  // 5. CUSTOM FIGMA-MATCHED BOTTOM NAVIGATION BAR
  // ===========================================================================

  Widget _buildCustomBottomNav() {
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFFF7F9F6),
        border: Border(
          top: BorderSide(color: Color(0xFFE5EDE4), width: 1.0),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Container(
          height: 66,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildNavItem(
                index: 0,
                label: 'Overview',
                icon: Icons.home_outlined,
                selectedIcon: Icons.home_rounded,
              ),
              _buildNavItem(
                index: 1,
                label: 'Appointments',
                icon: Icons.calendar_today_outlined,
                selectedIcon: Icons.calendar_month_rounded,
              ),
              _buildSosNavItem(
                index: 2,
                isActive: _currentIndex == 2,
              ),
              _buildNavItem(
                index: 3,
                label: 'Documents',
                icon: Icons.article_outlined,
                selectedIcon: Icons.article_rounded,
              ),
              _buildNavItem(
                index: 4,
                label: 'Profile',
                icon: Icons.person_outline_rounded,
                selectedIcon: Icons.person_rounded,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildNavItem({
    required int index,
    required String label,
    required IconData icon,
    required IconData selectedIcon,
  }) {
    final isSelected = _currentIndex == index;
    const primaryGreen = Color(0xFF284E3A);
    const softSagePill = Color(0xFFE2EBE1);
    const textSub = Color(0xFF5A635B);

    return InkWell(
      onTap: () => setState(() => _currentIndex = index),
      borderRadius: BorderRadius.circular(18),
      splashColor: Colors.transparent,
      highlightColor: Colors.transparent,
      child: SizedBox(
        width: 66,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              width: 52,
              height: 30,
              decoration: BoxDecoration(
                color: isSelected ? softSagePill : Colors.transparent,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(
                isSelected ? selectedIcon : icon,
                size: 20,
                color: isSelected ? primaryGreen : textSub,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 11,
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                color: isSelected ? primaryGreen : textSub,
                letterSpacing: -0.2,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSosNavItem({
    required int index,
    required bool isActive,
  }) {
    const sosActiveRed = Color(0xFFA03B30);
    const sosInactivePeach = Color(0xFFF6E2DB);

    return InkWell(
      onTap: () => setState(() => _currentIndex = index),
      borderRadius: BorderRadius.circular(18),
      splashColor: Colors.transparent,
      highlightColor: Colors.transparent,
      child: SizedBox(
        width: 66,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              width: 52,
              height: 30,
              decoration: BoxDecoration(
                color: isActive ? sosActiveRed : sosInactivePeach,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(
                Icons.notifications_active_rounded,
                size: 19,
                color: isActive ? Colors.white : sosActiveRed,
              ),
            ),
            const SizedBox(height: 3),
            const Text(
              'SOS',
              maxLines: 1,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                color: sosActiveRed,
                letterSpacing: 0.2,
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ===========================================================================
  // 6. TAB 0: OVERVIEW (QR CODE ISOLATED WITH REPAINTBOUNDARY)
  // ===========================================================================

  Widget _buildOverviewTab(String firstName) {
    const primaryGreen = Color(0xFF284E3A);
    const textSub = Color(0xFF5A635B);

    final hp = _profileData?['healthProfile'] ?? {};
    final u = _profileData?['user'] ?? widget.user;

    return RefreshIndicator(
      color: primaryGreen,
      onRefresh: () async {
        await _fetchQRPass();
        await _fetchProfile();
        await _fetchActiveQueueTicket();
      },
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        children: [
          const Text(
            'YOUR CAMPUS CARE',
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 2.0,
              color: textSub,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Hello, $firstName.',
            style: const TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.w800,
              color: Color(0xFF191C1A),
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 2),
          const Text(
            'Your health pass, ready when you need it.',
            style: TextStyle(fontSize: 14, color: textSub),
          ),
          const SizedBox(height: 18),

          if (_activeQueueTicket != null) ...[
            _buildActiveQueueCard(),
            const SizedBox(height: 16),
          ],

          // Campus Health Pass Card
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: const Color(0xFFE2EBE1),
              borderRadius: BorderRadius.circular(24),
            ),
            child: Column(
              children: [
                const Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.qr_code_2_rounded, size: 20, color: primaryGreen),
                        SizedBox(width: 8),
                        Text(
                          'Campus health pass',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF191C1A),
                          ),
                        ),
                      ],
                    ),
                    Icon(Icons.verified_outlined, size: 18, color: primaryGreen),
                  ],
                ),
                const SizedBox(height: 18),

                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.04),
                        blurRadius: 10,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: _loadingQR
                      ? const SizedBox(
                          height: 180,
                          width: 180,
                          child: Center(
                            child: CircularProgressIndicator(color: primaryGreen, strokeWidth: 2),
                          ),
                        )
                      : _qrToken.isNotEmpty
                          ? RepaintBoundary(
                              child: QrImageView(data: _qrToken, version: QrVersions.auto, size: 180),
                            )
                          : const SizedBox(
                              height: 180,
                              width: 180,
                              child: Center(child: Text('Pass offline')),
                            ),
                ),
                const SizedBox(height: 14),

                const Text(
                  'Dynamic QR · Valid for touchless check-in',
                  style: TextStyle(fontSize: 11, color: textSub, fontWeight: FontWeight.w500),
                ),
                const SizedBox(height: 8),

                Text(
                  '${u['first_name']} ${u['last_name']}',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF191C1A),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Student · ${u['student_no'] ?? '22-LN-0123'}',
                  style: const TextStyle(fontSize: 12, color: textSub),
                ),
                const SizedBox(height: 18),

                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    TextButton(
                      onPressed: () => _fetchQRPass(),
                      child: const Row(
                        children: [
                          Text('Refresh pass', style: TextStyle(color: primaryGreen, fontSize: 13, fontWeight: FontWeight.w600)),
                          SizedBox(width: 4),
                          Icon(Icons.north_east_rounded, size: 14, color: primaryGreen),
                        ],
                      ),
                    ),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: primaryGreen,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        shape: const StadiumBorder(),
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      ),
                      onPressed: () => setState(() => _currentIndex = 1),
                      child: const Row(
                        children: [
                          Text('Book consultation', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                          SizedBox(width: 4),
                          Icon(Icons.arrow_forward_rounded, size: 14),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Shortcut to Care
          const Text(
            'A shortcut to your care',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Color(0xFF191C1A)),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: GestureDetector(
                  onTap: () => setState(() => _currentIndex = 3),
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEDEBF7),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Icon(Icons.medication_outlined, size: 24, color: Color(0xFF5B4EA1)),
                            Icon(Icons.north_east_rounded, size: 16, color: Color(0xFF5B4EA1)),
                          ],
                        ),
                        SizedBox(height: 14),
                        Text(
                          'Prescriptions',
                          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: Color(0xFF261D52)),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'Your medication, made clear.',
                          style: TextStyle(fontSize: 11.5, color: Color(0xFF5A5285)),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: GestureDetector(
                  onTap: () => setState(() => _currentIndex = 3),
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF7F1E6),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Icon(Icons.description_outlined, size: 24, color: Color(0xFF8C6826)),
                            Icon(Icons.north_east_rounded, size: 16, color: Color(0xFF8C6826)),
                          ],
                        ),
                        SizedBox(height: 14),
                        Text(
                          'Medical clearances',
                          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: Color(0xFF422F0A)),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'Ready for your next step.',
                          style: TextStyle(fontSize: 11.5, color: Color(0xFF6B5731)),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),

          // Dark Green Card
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: const Color(0xFF244333),
              borderRadius: BorderRadius.circular(24),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Row(
                      children: [
                        Icon(Icons.favorite_border_rounded, size: 16, color: Color(0xFFB7DFCA)),
                        SizedBox(width: 8),
                        Text(
                          'YOUR HEALTH AT A GLANCE',
                          style: TextStyle(
                            fontSize: 10,
                            letterSpacing: 1.8,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFFB7DFCA),
                          ),
                        ),
                      ],
                    ),
                    IconButton(
                      icon: const Icon(Icons.more_horiz, color: Colors.white70),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      onPressed: () => setState(() => _currentIndex = 4),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.15),
                        shape: BoxShape.circle,
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        _getInitials(u['first_name'] ?? 'P', u['last_name'] ?? 'S'),
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${u['first_name']} ${u['last_name']}',
                          style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700),
                        ),
                        Text(
                          'Student · ${u['student_no'] ?? '22-LN-0123'}',
                          style: const TextStyle(color: Colors.white70, fontSize: 12),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                const Divider(color: Colors.white24, height: 1),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Row(
                            children: [
                              Icon(Icons.opacity, size: 14, color: Colors.redAccent),
                              SizedBox(width: 4),
                              Text('Blood type', style: TextStyle(color: Colors.white70, fontSize: 11)),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            hp['blood_type'] ?? 'O+',
                            style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Known allergy', style: TextStyle(color: Colors.white70, fontSize: 11)),
                          const SizedBox(height: 4),
                          Text(
                            (hp['allergies'] != null && hp['allergies'].toString().isNotEmpty)
                                ? hp['allergies']
                                : 'None',
                            style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w700),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                GestureDetector(
                  onTap: () => setState(() => _currentIndex = 4),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('View full profile', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600)),
                      Icon(Icons.arrow_forward_rounded, size: 16, color: Colors.white),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Campus Infirmary Info
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFFE2EBE2)),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.circle, size: 8, color: primaryGreen),
                    SizedBox(width: 8),
                    Text('Your campus infirmary', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: Color(0xFF191C1A))),
                  ],
                ),
                SizedBox(height: 12),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.location_on_outlined, size: 16, color: textSub),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text('Pangasinan State University\nLingayen Campus, Pangasinan', style: TextStyle(fontSize: 12, color: textSub, height: 1.4)),
                    ),
                  ],
                ),
                SizedBox(height: 10),
                Row(
                  children: [
                    Icon(Icons.access_time_rounded, size: 16, color: textSub),
                    SizedBox(width: 8),
                    Text('Monday–Friday · 8:00 AM – 5:00 PM', style: TextStyle(fontSize: 12, color: textSub)),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Gentle Reminder
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFFE2EBE2)),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.eco_outlined, size: 20, color: primaryGreen),
                SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('A gentle reminder', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: Color(0xFF191C1A))),
                      SizedBox(height: 4),
                      Text('Take a breath. Drink some water.\nSmall habits make a big difference.', style: TextStyle(fontSize: 12, color: textSub, height: 1.4)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  // Active Queue Banner
  Widget _buildActiveQueueCard() {
    final ticket = _activeQueueTicket!;
    final status = ticket['status'] ?? 'waiting';
    final ticketNo = ticket['ticket_no'] ?? 'Q-00';
    final isServing = status == 'in-consultation';
    final patientsAhead = ticket['patients_ahead'] ?? 0;
    final waitMins = ticket['estimated_wait_minutes'] ?? 0;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: isServing ? const Color(0xFFFEF3C7) : const Color(0xFFE5EDE4),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: isServing ? Colors.amber.shade700 : const Color(0xFF284E3A), width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                isServing ? 'NOW SERVING YOUR TICKET!' : 'ACTIVE CLINIC QUEUE',
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 11,
                  letterSpacing: 1.5,
                  color: isServing ? Colors.amber.shade900 : const Color(0xFF284E3A),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: isServing ? Colors.amber.shade800 : const Color(0xFF284E3A),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Text(
                  isServing ? 'YOUR TURN' : 'WAITING',
                  style: const TextStyle(color: Colors.white, fontSize: 9.5, fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                ticketNo,
                style: TextStyle(
                  fontSize: 36,
                  fontWeight: FontWeight.w900,
                  color: isServing ? Colors.amber.shade900 : const Color(0xFF284E3A),
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    isServing ? 'Proceed To' : 'Patients Ahead',
                    style: const TextStyle(fontSize: 11, color: Color(0xFF5A635B)),
                  ),
                  Text(
                    isServing ? (ticket['clinic_room'] ?? 'Clinic Room 1') : '$patientsAhead',
                    style: TextStyle(
                      fontSize: isServing ? 14 : 20,
                      fontWeight: FontWeight.bold,
                      color: const Color(0xFF191C1A),
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Practitioner: ${ticket['doctor_name']} • Est: ~${waitMins > 0 ? waitMins : 5} mins',
            style: const TextStyle(fontSize: 12, color: Color(0xFF5A635B)),
          ),
        ],
      ),
    );
  }

  // ===========================================================================
  // 7. TAB 2: EMERGENCY SOS (FIGMA CONCENTRIC CIRCLE DESIGN)
  // ===========================================================================

  Widget _buildSOSTab() {
    const textSub = Color(0xFF5A635B);
    const textMain = Color(0xFF191C1A);
    const primaryGreen = Color(0xFF284E3A);

    // Exact Figma Palette
    const peachCardBg = Color(0xFFF9EDE5);
    const demoBadgeBg = Color(0xFFF2D9CE);
    const demoBadgeText = Color(0xFF8D3F33);
    const sirenCircleBg = Color(0xFFF1D8CC);
    const activeCrimson = Color(0xFFA03B30);
    const activeHalo = Color(0xFFF4C8C1);
    const inactiveCircle = Color(0xFFBFA298);
    const inactiveHalo = Color(0xFFE8D8CF);

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header Eyebrow & Title
            const Text(
              "WE'RE HERE WHEN YOU NEED US",
              style: TextStyle(
                fontSize: 10.5,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.8,
                color: textSub,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Emergency SOS',
              style: TextStyle(
                fontSize: 30,
                fontWeight: FontWeight.w800,
                color: textMain,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 18),

            // Main Peach SOS Card
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 26),
              decoration: BoxDecoration(
                color: peachCardBg,
                borderRadius: BorderRadius.circular(28),
              ),
              child: Column(
                children: [
                  // "DEMO ONLY • NOT AN EMERGENCY SERVICE" Pill Badge
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    decoration: BoxDecoration(
                      color: demoBadgeBg,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Text(
                      'DEMO ONLY • NOT AN EMERGENCY SERVICE',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.0,
                        color: demoBadgeText,
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Siren / Beacon Icon + Title
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 38,
                        height: 38,
                        decoration: const BoxDecoration(
                          color: sirenCircleBg,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.notifications_active_outlined,
                          size: 20,
                          color: demoBadgeText,
                        ),
                      ),
                      const SizedBox(width: 10),
                      const Text(
                        'Your campus SOS',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          color: textMain,
                          letterSpacing: -0.3,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // Explanatory Subtitle
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 10),
                    child: Text(
                      'In the connected app, your campus response team would receive your location and essential medical details.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 13,
                        color: textSub,
                        height: 1.45,
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Consent Checkbox Row
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                          width: 22,
                          height: 22,
                          child: Checkbox(
                            value: _sosConsent,
                            activeColor: activeCrimson,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(4),
                            ),
                            side: BorderSide(
                              color: _sosConsent ? activeCrimson : const Color(0xFFC7AAA0),
                              width: 1.8,
                            ),
                            onChanged: (val) => setState(() => _sosConsent = val ?? false),
                          ),
                        ),
                        const SizedBox(width: 12),
                        const Expanded(
                          child: Text(
                            'I consent to sharing my location and medical details with authorized campus responders.',
                            style: TextStyle(
                              fontSize: 12.5,
                              color: textSub,
                              height: 1.4,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 26),

                  // Concentric Circular Button with Hold Animation
                  GestureDetector(
                    onTapDown: (_) => _startHold(),
                    onTapUp: (_) => _cancelHold(),
                    onTapCancel: () => _cancelHold(),
                    child: ValueListenableBuilder<double>(
                      valueListenable: _holdProgressNotifier,
                      builder: (context, progress, _) {
                        return Container(
                          width: 220,
                          height: 220,
                          decoration: BoxDecoration(
                            color: _sosConsent ? activeHalo : inactiveHalo,
                            shape: BoxShape.circle,
                          ),
                          alignment: Alignment.center,
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              // Circular Hold Progress Arc
                              if (progress > 0.0)
                                SizedBox(
                                  width: 176,
                                  height: 176,
                                  child: CircularProgressIndicator(
                                    value: progress,
                                    strokeWidth: 5,
                                    valueColor: const AlwaysStoppedAnimation<Color>(Colors.white),
                                    backgroundColor: Colors.transparent,
                                  ),
                                ),

                              // Inner Circle Core
                              Container(
                                width: 162,
                                height: 162,
                                decoration: BoxDecoration(
                                  color: _sosConsent ? activeCrimson : inactiveCircle,
                                  shape: BoxShape.circle,
                                  boxShadow: _isHolding
                                      ? [
                                          BoxShadow(
                                            color: activeCrimson.withValues(alpha: 0.45),
                                            blurRadius: 20,
                                            spreadRadius: 4,
                                          )
                                        ]
                                      : null,
                                ),
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    const Icon(
                                      Icons.back_hand_rounded,
                                      size: 30,
                                      color: Colors.white,
                                    ),
                                    const SizedBox(height: 6),
                                    const Text(
                                      'HOLD TO',
                                      style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w800,
                                        letterSpacing: 1.2,
                                        color: Colors.white,
                                      ),
                                    ),
                                    const Text(
                                      'TRY SOS',
                                      style: TextStyle(
                                        fontSize: 18,
                                        fontWeight: FontWeight.w900,
                                        letterSpacing: 0.8,
                                        color: Colors.white,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      _isHolding
                                          ? '${((1.0 - progress) * 2.5).toStringAsFixed(1)}s remaining'
                                          : 'for 2.5 seconds',
                                      style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w500,
                                        color: Colors.white.withValues(alpha: 0.85),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 18),

                  // Bottom Preview Disclaimer / Status
                  Text(
                    _sosStatusMessage.isNotEmpty
                        ? _sosStatusMessage
                        : 'No location is collected or shared in this preview.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: _sosStatusMessage.isNotEmpty ? FontWeight.w700 : FontWeight.w500,
                      color: _sosStatusMessage.contains('DISPATCHED')
                          ? primaryGreen
                          : _sosStatusMessage.isNotEmpty
                              ? activeCrimson
                              : textSub,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Lower "Call 911" White Card
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(22),
                border: Border.all(color: const Color(0xFFE2EBE2)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  const Text(
                    'For an out of campus emergency, call emergency services now.',
                    style: TextStyle(
                      fontSize: 13,
                      color: textSub,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFE2EBE1),
                        foregroundColor: primaryGreen,
                        elevation: 0,
                        shape: const StadiumBorder(),
                      ),
                      onPressed: () => _launchDialer('911'),
                      icon: const Icon(Icons.phone_outlined, size: 18, color: primaryGreen),
                      label: const Text(
                        'Call 911',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: primaryGreen,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  // ===========================================================================
  // 8. TAB 4: PROFILE
  // ===========================================================================

  Widget _buildProfileTab(String initials) {
    const primaryGreen = Color(0xFF284E3A);
    const softSage = Color(0xFFE5EDE4);
    const textSub = Color(0xFF5A635B);

    if (_loadingProfile && _profileData == null) {
      return const Center(child: CircularProgressIndicator(color: primaryGreen));
    }

    final hp = _profileData?['healthProfile'] ?? {};
    final u = _profileData?['user'] ?? widget.user;

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
      color: primaryGreen,
      onRefresh: () async {
        await _fetchProfile();
        await _checkPrivacyConsent();
      },
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        children: [
          const Text(
            "A SPACE THAT'S YOURS",
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.8,
              color: textSub,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Your health. Your profile.',
            style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: Color(0xFF191C1A), letterSpacing: -0.5),
          ),
          const SizedBox(height: 2),
          const Text(
            'The important details that help us care for you.',
            style: TextStyle(fontSize: 14, color: textSub),
          ),
          const SizedBox(height: 18),

          // User Card
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: const Color(0xFFE2EBE2)),
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    Container(
                      width: 54,
                      height: 54,
                      decoration: const BoxDecoration(
                        color: Color(0xFFE6DDCF),
                        shape: BoxShape.circle,
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        initials,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF4A4133),
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${u['first_name']} ${u['last_name']}',
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Color(0xFF191C1A)),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${u['student_no'] ?? '22-LN-0123'} · ${u['role_name'] ?? 'Student patient'}',
                            style: const TextStyle(fontSize: 12.5, color: textSub),
                          ),
                          Text(
                            '${u['course'] ?? 'BS Information Technology'}${u['year_level'] != null ? ' · Year ${u['year_level']}' : ''}',
                            style: const TextStyle(fontSize: 12, color: textSub),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  height: 44,
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: softSage,
                      foregroundColor: primaryGreen,
                      elevation: 0,
                      shape: const StadiumBorder(),
                    ),
                    onPressed: () => setState(() => _currentIndex = 0),
                    icon: const Icon(Icons.qr_code_2_rounded, size: 18),
                    label: const Text('View health pass', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Clinical Details Grid Card
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: const Color(0xFFE2EBE2)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Clinical details',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Color(0xFF191C1A)),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Blood type', style: TextStyle(fontSize: 11.5, color: textSub)),
                          const SizedBox(height: 4),
                          Text(hp['blood_type'] ?? 'O+', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: Color(0xFF191C1A))),
                        ],
                      ),
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Known allergy', style: TextStyle(fontSize: 11.5, color: textSub)),
                          const SizedBox(height: 4),
                          Text(
                            (hp['allergies'] != null && hp['allergies'].toString().isNotEmpty)
                                ? hp['allergies']
                                : 'None',
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Color(0xFF7A2E26)),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Condition', style: TextStyle(fontSize: 11.5, color: textSub)),
                          const SizedBox(height: 4),
                          Text(hp['chronic_conditions'] ?? 'None', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFF191C1A))),
                        ],
                      ),
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Height', style: TextStyle(fontSize: 11.5, color: textSub)),
                          const SizedBox(height: 4),
                          Text('${hp['height'] ?? '162.5'} cm', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFF191C1A))),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Weight', style: TextStyle(fontSize: 11.5, color: textSub)),
                    const SizedBox(height: 4),
                    Text('${hp['weight'] ?? '54'} kg', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFF191C1A))),
                  ],
                ),
                const SizedBox(height: 14),
                // ▼ NEW: freshness line showing when a nurse/doctor last verified these
                Row(
                  children: [
                    const Icon(Icons.update, size: 13, color: textSub),
                    const SizedBox(width: 5),
                    Expanded(
                      child: Text(
                        'Last verified by clinic staff: ${_formatRelativeDate(hp['updated_at']?.toString())}',
                        style: const TextStyle(fontSize: 11, color: textSub, fontStyle: FontStyle.italic),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: softSage,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.verified_outlined, size: 16, color: primaryGreen),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Clinical details can only be updated in person by campus infirmary staff.',
                          style: TextStyle(fontSize: 11.5, color: primaryGreen, fontWeight: FontWeight.w500, height: 1.3),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Immunizations
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: const Color(0xFFE2EBE2)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Immunizations',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Color(0xFF191C1A)),
                ),
                const SizedBox(height: 14),
                if (immunizations.isEmpty)
                  const Text('No records logged.', style: TextStyle(fontSize: 13, color: textSub))
                else
                  ...immunizations.map(
                    (imm) => Padding(
                      padding: const EdgeInsets.only(bottom: 10.0),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(4),
                            decoration: BoxDecoration(
                              color: softSage,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Icon(Icons.check, size: 14, color: primaryGreen),
                          ),
                          const SizedBox(width: 10),
                          Text(imm, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: Color(0xFF191C1A))),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Contact Details
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: const Color(0xFFE2EBE2)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Contact details',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Color(0xFF191C1A)),
                    ),
                    TextButton(
                      onPressed: () async {
                        final updated = await Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => EditProfileScreen(user: u, healthProfile: hp),
                          ),
                        );
                        if (updated == true) _fetchProfile();
                      },
                      child: const Text('Edit', style: TextStyle(color: primaryGreen, fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                const Text('YOUR MOBILE NUMBER', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, letterSpacing: 1.2, color: textSub)),
                const SizedBox(height: 4),
                Text(u['phone'] ?? '09211234571', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFF191C1A))),
                const SizedBox(height: 14),
                const Text('EMERGENCY CONTACT', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, letterSpacing: 1.2, color: textSub)),
                const SizedBox(height: 4),
                Text(
                  hp['emergency_contact_name'] ?? 'Maria Movida (Mother)',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFF191C1A)),
                ),
                Text(
                  hp['emergency_contact_phone'] ?? '09299876543',
                  style: const TextStyle(fontSize: 13, color: textSub),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Quick Settings Links
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: const Color(0xFFE2EBE2)),
            ),
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.lock_outline_rounded, size: 20, color: primaryGreen),
                  title: const Text('Change password', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                  trailing: const Icon(Icons.chevron_right, size: 18, color: textSub),
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ChangePasswordScreen())),
                ),
                const Divider(height: 1, indent: 52),
                ListTile(
                  leading: const Icon(Icons.privacy_tip_outlined, size: 20, color: primaryGreen),
                  title: const Text('Data privacy terms (R.A. 10173)', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                  subtitle: Text(
                    _hasConsented ? 'Consent active · Encrypted with AES-256' : 'Consent pending verification',
                    style: TextStyle(
                      fontSize: 11.5,
                      color: _hasConsented ? const Color(0xFF284E3A) : const Color(0xFF7A2E26),
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (_hasConsented)
                        TextButton(
                          onPressed: _showRevokeDialog,
                          child: const Text('Revoke', style: TextStyle(color: Color(0xFF7A2E26), fontSize: 12, fontWeight: FontWeight.w600)),
                        ),
                      const Icon(Icons.chevron_right, size: 18, color: textSub),
                    ],
                  ),
                  onTap: () => _showConsentModal(isMandatory: false),
                ),
                const Divider(height: 1, indent: 52),
                ListTile(
                  leading: const Icon(Icons.logout_rounded, size: 20, color: Colors.red),
                  title: const Text('Sign out of portal', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Colors.red)),
                  trailing: const Icon(Icons.chevron_right, size: 18, color: Colors.red),
                  onTap: _handleSignOut,
                ),
              ],
            ),
          ),
          const SizedBox(height: 28),
        ],
      ),
    );
  }
}