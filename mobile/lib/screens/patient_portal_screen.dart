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
import '../utils/responsive.dart';
import '../widgets/session_timeout_listener.dart';
import '../widgets/valetudo_logo.dart';
import '../services/emergency_alert_service.dart';
import '../services/offline_sos_service.dart';
import '../services/connectivity_service.dart';
import 'login_screen.dart';
import 'edit_profile_screen.dart';
import 'consultation_scheduler_screen.dart';
import 'documents_viewer_screen.dart';
import 'change_password_screen.dart';

/// Role-aware identity presentation for the mobile portal.
///
/// The same screen is used by three patient-side populations (STUDENT,
/// FACULTY, NON_TEACHING). Their profile columns differ, so a single
/// hardcoded "Student · 22-LN-0123" line shows fabricated data for the
/// other two. This helper reads the primary_role from the profile payload
/// and produces the right three display strings for each.
class _PatientIdentity {
  final String roleWord;      // "Student" | "Faculty" | "Support Staff"
  final String identifier;    // student_no | employee_no | '' (faculty)
  final String affiliation;   // "BS Info Tech · Year 3" | "Dept · Position"

  const _PatientIdentity({
    required this.roleWord,
    required this.identifier,
    required this.affiliation,
  });

  /// Joins non-empty parts with a separator. Was previously a local
  /// closure inside the factory, which meant the `fullSubtitle` getter
  /// couldn't see it (Dart closures don't leak out of their scope).
  static String _joinNonEmpty(List<dynamic> parts, [String sep = ' · ']) {
    return parts
        .where((v) => v != null && v.toString().trim().isNotEmpty)
        .map((v) => v.toString().trim())
        .join(sep);
  }

  factory _PatientIdentity.fromProfile(
    Map<String, dynamic>? profileData,
    Map<String, dynamic> fallbackUser,
  ) {
    final u = profileData?['user'] ?? fallbackUser;
    final role = (u['primary_role'] ?? 'STUDENT').toString().toUpperCase();

    switch (role) {
      case 'FACULTY':
        return _PatientIdentity(
          roleWord: 'Faculty',
          identifier: '',
          affiliation: _joinNonEmpty([u['department'], u['position']]),
        );

      case 'NON_TEACHING':
        return _PatientIdentity(
          roleWord: 'Support Staff',
          identifier: (u['employee_no'] ?? '').toString().trim(),
          affiliation: _joinNonEmpty([u['department'], u['position']]),
        );

      case 'STUDENT':
      default:
        return _PatientIdentity(
          roleWord: 'Student',
          identifier: (u['student_no'] ?? '').toString().trim(),
          affiliation: _joinNonEmpty([
            u['course'],
            if (u['year_level'] != null) 'Year ${u['year_level']}',
          ]),
        );
    }
  }

  /// Compact form for the health pass: "Student · 22-LN-0123" or "Faculty".
  String get roleWithIdentifier =>
      identifier.isEmpty ? roleWord : '$roleWord · $identifier';

  /// Verbose form for the profile header, e.g.
  /// "Student · 22-LN-0123 · BS Information Technology · Year 3".
  String get fullSubtitle => _joinNonEmpty([roleWord, identifier, affiliation]);
}

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

  bool _hasConsented = false;

  Map<String, dynamic>? _activeQueueTicket;
  Timer? _queuePollingTimer;
  io.Socket? _socket;
  String _previousQueueStatus = '';

  bool _sosConsent = false;
  bool _isHolding = false;
  final ValueNotifier<double> _holdProgressNotifier = ValueNotifier<double>(0.0);
  Timer? _holdTimer;
  bool _isDispatchingSOS = false;
  String _sosStatusMessage = '';

  /// Role-aware display strings, recomputed on every build from the
  /// currently loaded profile. Cheap enough — no caching needed.
  _PatientIdentity get _identity =>
      _PatientIdentity.fromProfile(_profileData, widget.user);

  @override
  void initState() {
    super.initState();
    _checkPrivacyConsent();
    _fetchQRPass();
    _fetchProfile();
    _fetchActiveQueueTicket();
    _initQueueSocket();
    ConnectivityService().addListener(_onConnectivityChanged);

    _queuePollingTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _fetchActiveQueueTicket(silent: true),
    );
  }

  @override
  void dispose() {
    ConnectivityService().removeListener(_onConnectivityChanged);
    _queuePollingTimer?.cancel();
    _holdTimer?.cancel();
    _holdProgressNotifier.dispose();
    _socket?.disconnect();
    super.dispose();
  }

  // ===========================================================================
  // CONNECTIVITY + OFFLINE SOS REPLAY
  // ===========================================================================

  void _onConnectivityChanged() {
    if (ConnectivityService().isOnline) _replayQueuedSosEvents();
    if (mounted) setState(() {});
  }

  Future<void> _replayQueuedSosEvents() async {
    final pending = await OfflineSosService().pendingSosEvents();
    if (pending.isEmpty) return;

    final token = await _storage.read(key: 'jwt_token');
    if (token == null) return;

    final List<Map<String, dynamic>> stillFailing = [];
    for (final event in pending) {
      try {
        final res = await ApiConfig.client.post(
          Uri.parse('${ApiConfig.baseUrl}/api/emergency/sos'),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $token',
          },
          body: jsonEncode({
            'latitude': event['latitude'],
            'longitude': event['longitude'],
            'notes': event['notes'],
          }),
        );
        if (res.statusCode >= 500) stillFailing.add(event);
      } catch (_) {
        stillFailing.add(event);
      }
    }

    await OfflineSosService().savePendingQueue(stillFailing);

    if (stillFailing.isEmpty && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('✅ Queued SOS alert delivered to campus responders.'),
          backgroundColor: Color(0xFF15803D),
        ),
      );
    }
  }

  // ===========================================================================
  // R.A. 10173 CONSENT
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
          if (!consented) _showConsentModal(isMandatory: true);
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
    final rs = Rs.of(context);
    showDialog(
      context: context,
      barrierDismissible: !isMandatory,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(rs.r(20))),
        backgroundColor: Colors.white,
        title: Row(
          children: [
            const Icon(Icons.privacy_tip_outlined, color: Color(0xFF284E3A)),
            SizedBox(width: rs.w(8)),
            Expanded(
              child: Text(
                'Data Privacy Notice',
                style: TextStyle(fontSize: rs.sp(16), fontWeight: FontWeight.w800),
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
    final rs = Rs.of(context);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(rs.r(20))),
        backgroundColor: Colors.white,
        title: Text(
          'Revoke Consent?',
          style: TextStyle(
            fontWeight: FontWeight.w800,
            color: const Color(0xFF7A2E26),
            fontSize: rs.sp(16),
          ),
        ),
        content: Text(
          'Under R.A. 10173, revoking consent will suspend your access to digital health passes, prescriptions, and online scheduling.',
          style: TextStyle(fontSize: rs.sp(13), color: const Color(0xFF5A635B)),
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
  // QUEUE + PROFILE FETCHERS
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
        final decoded = jsonDecode(res.body);
        setState(() => _profileData = decoded);

        try {
          final hp = decoded['healthProfile'] ?? {};
          if (hp['emergency_contact_name'] != null &&
              hp['emergency_contact_phone'] != null) {
            await OfflineSosService().cacheEmergencyInfo(
              contactName: hp['emergency_contact_name'],
              contactPhone: hp['emergency_contact_phone'],
              bloodType: hp['blood_type'],
              allergies: hp['allergies'],
              chronicConditions: hp['chronic_conditions'],
            );
          }
        } catch (_) {}
      }
    } catch (_) {}
    if (mounted) setState(() => _loadingProfile = false);
  }

  // ===========================================================================
  // SOS
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
    setState(() => _sosStatusMessage = 'Broadcasting location...');

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
      setState(() => _sosStatusMessage = 'SOS cancelled.');
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

      if (!ConnectivityService().isOnline) {
        await OfflineSosService().queueOfflineSos(
          latitude: position.latitude,
          longitude: position.longitude,
          notes: 'Offline SOS triggered via mobile panic button',
        );
        if (mounted) {
          setState(() {
            _sosStatusMessage =
                'OFFLINE: SOS queued. Use the call buttons above to contact help now.';
          });
        }
        await OfflineSosService().dialNumber('911');
        if (mounted) setState(() => _isDispatchingSOS = false);
        return;
      }

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
        if (mounted) _showEmergencyConfirmationDialog();
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
    final rs = Rs.of(context);
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(rs.r(20))),
        icon: const Icon(Icons.check_circle_outline, color: Color(0xFF284E3A), size: 54),
        title: Text(
          'SOS Alert Active',
          style: TextStyle(
            fontWeight: FontWeight.w800,
            color: const Color(0xFF284E3A),
            fontSize: rs.sp(17),
          ),
        ),
        content: Text(
          'Your live GPS coordinates and medical profile have been securely transmitted to the PSU Infirmary and campus quick-response unit.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: rs.sp(13.5),
            color: const Color(0xFF5A635B),
            height: 1.4,
          ),
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
    final token = await _storage.read(key: 'jwt_token');
    if (token != null) {
      try {
        await ApiConfig.client.post(
          Uri.parse('${ApiConfig.baseUrl}/api/auth/logout'),
          headers: {'Authorization': 'Bearer $token'},
        );
      } catch (_) {}
    }
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
  // MAIN BUILD
  // ===========================================================================

  @override
  Widget build(BuildContext context) {
    final rs = Rs.of(context);
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
          preferredSize: Size.fromHeight(rs.h(64).clamp(56.0, 72.0)),
          child: SafeArea(
            child: Padding(
              padding: EdgeInsets.symmetric(
                horizontal: rs.w(20),
                vertical: rs.h(8),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      ValetudoLogo(size: rs.w(34).clamp(28.0, 42.0)),
                      SizedBox(width: rs.w(8)),
                      Text(
                        'valetudo.',
                        style: TextStyle(
                          fontSize: rs.sp(18),
                          fontWeight: FontWeight.w900,
                          color: const Color(0xFF191C1A),
                          letterSpacing: -0.5,
                        ),
                      ),
                    ],
                  ),
                  Row(
                    children: [
                      Container(
                        width: rs.w(36).clamp(32.0, 42.0),
                        height: rs.w(36).clamp(32.0, 42.0),
                        decoration: const BoxDecoration(
                          color: Color(0xFFE5EDE4),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          Icons.notifications_none_rounded,
                          size: rs.w(20),
                          color: primaryGreen,
                        ),
                      ),
                      SizedBox(width: rs.w(8)),
                      Container(
                        width: rs.w(36).clamp(32.0, 42.0),
                        height: rs.w(36).clamp(32.0, 42.0),
                        decoration: const BoxDecoration(
                          color: Color(0xFFE6DDCF),
                          shape: BoxShape.circle,
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          initials,
                          style: TextStyle(
                            fontSize: rs.sp(12),
                            fontWeight: FontWeight.w800,
                            color: const Color(0xFF4A4133),
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
        body: Column(
          children: [
            if (!ConnectivityService().isOnline) _buildOfflineBanner(rs),
            Expanded(child: tabs[_currentIndex]),
          ],
        ),
        bottomNavigationBar: _buildCustomBottomNav(rs),
      ),
    );
  }

  Widget _buildOfflineBanner(Rs rs) {
    return Container(
      width: double.infinity,
      padding: EdgeInsets.symmetric(horizontal: rs.w(16), vertical: rs.h(10)),
      decoration: const BoxDecoration(
        color: Color(0xFFFDE8E8),
        border: Border(
          bottom: BorderSide(color: Color(0xFFF8B4B4), width: 1),
        ),
      ),
      child: Row(
        children: [
          const Icon(Icons.wifi_off_rounded, size: 16, color: Color(0xFF7A2E26)),
          SizedBox(width: rs.w(8)),
          Expanded(
            child: Text(
              'Offline · Last synced data shown. SOS still works via call.',
              style: TextStyle(
                fontSize: rs.sp(12),
                fontWeight: FontWeight.w600,
                color: const Color(0xFF7A2E26),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ===========================================================================
  // BOTTOM NAV
  // ===========================================================================

  Widget _buildCustomBottomNav(Rs rs) {
    final navHeight = rs.h(66).clamp(58.0, 74.0);
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFFF7F9F6),
        border: Border(
          top: BorderSide(color: Color(0xFFE5EDE4), width: 1.0),
        ),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: navHeight,
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: rs.w(6),
              vertical: rs.h(4),
            ),
            child: Row(
              children: [
                Expanded(
                  child: _buildNavItem(
                    rs: rs,
                    index: 0,
                    label: 'Overview',
                    icon: Icons.home_outlined,
                    selectedIcon: Icons.home_rounded,
                  ),
                ),
                Expanded(
                  child: _buildNavItem(
                    rs: rs,
                    index: 1,
                    label: 'Appointments',
                    icon: Icons.calendar_today_outlined,
                    selectedIcon: Icons.calendar_month_rounded,
                  ),
                ),
                Expanded(
                  child: _buildSosNavItem(
                    rs: rs,
                    index: 2,
                    isActive: _currentIndex == 2,
                  ),
                ),
                Expanded(
                  child: _buildNavItem(
                    rs: rs,
                    index: 3,
                    label: 'Documents',
                    icon: Icons.article_outlined,
                    selectedIcon: Icons.article_rounded,
                  ),
                ),
                Expanded(
                  child: _buildNavItem(
                    rs: rs,
                    index: 4,
                    label: 'Profile',
                    icon: Icons.person_outline_rounded,
                    selectedIcon: Icons.person_rounded,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildNavItem({
    required Rs rs,
    required int index,
    required String label,
    required IconData icon,
    required IconData selectedIcon,
  }) {
    final isSelected = _currentIndex == index;
    const primaryGreen = Color(0xFF284E3A);
    const softSagePill = Color(0xFFE2EBE1);
    const textSub = Color(0xFF5A635B);

    final pillWidth = rs.w(52).clamp(40.0, 56.0);
    final pillHeight = rs.h(30).clamp(24.0, 34.0);

    return InkWell(
      onTap: () => setState(() => _currentIndex = index),
      borderRadius: BorderRadius.circular(rs.r(18)),
      splashColor: Colors.transparent,
      highlightColor: Colors.transparent,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            width: pillWidth,
            height: pillHeight,
            decoration: BoxDecoration(
              color: isSelected ? softSagePill : Colors.transparent,
              borderRadius: BorderRadius.circular(rs.r(16)),
            ),
            child: Icon(
              isSelected ? selectedIcon : icon,
              size: rs.w(20).clamp(17.0, 22.0),
              color: isSelected ? primaryGreen : textSub,
            ),
          ),
          SizedBox(height: rs.h(3)),
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: rs.sp(11),
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                color: isSelected ? primaryGreen : textSub,
                letterSpacing: -0.2,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSosNavItem({
    required Rs rs,
    required int index,
    required bool isActive,
  }) {
    const sosActiveRed = Color(0xFFA03B30);
    const sosInactivePeach = Color(0xFFF6E2DB);

    final pillWidth = rs.w(52).clamp(40.0, 56.0);
    final pillHeight = rs.h(30).clamp(24.0, 34.0);

    return InkWell(
      onTap: () => setState(() => _currentIndex = index),
      borderRadius: BorderRadius.circular(rs.r(18)),
      splashColor: Colors.transparent,
      highlightColor: Colors.transparent,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            width: pillWidth,
            height: pillHeight,
            decoration: BoxDecoration(
              color: isActive ? sosActiveRed : sosInactivePeach,
              borderRadius: BorderRadius.circular(rs.r(16)),
            ),
            child: Icon(
              Icons.notifications_active_rounded,
              size: rs.w(19).clamp(16.0, 21.0),
              color: isActive ? Colors.white : sosActiveRed,
            ),
          ),
          SizedBox(height: rs.h(3)),
          Flexible(
            child: Text(
              'SOS',
              maxLines: 1,
              style: TextStyle(
                fontSize: rs.sp(11),
                fontWeight: FontWeight.w800,
                color: sosActiveRed,
                letterSpacing: 0.2,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ===========================================================================
  // TAB 0: OVERVIEW
  // ===========================================================================

  Widget _buildOverviewTab(String firstName) {
    final rs = Rs.of(context);
    const primaryGreen = Color(0xFF284E3A);
    const textSub = Color(0xFF5A635B);

    final hp = _profileData?['healthProfile'] ?? {};
    final u = _profileData?['user'] ?? widget.user;
    final identity = _identity;

    final maxContentWidth = rs.isTablet ? 560.0 : double.infinity;
    final qrSize = rs.w(180).clamp(150.0, 220.0);

    return Center(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxContentWidth),
        child: RefreshIndicator(
          color: primaryGreen,
          onRefresh: () async {
            await _fetchQRPass();
            await _fetchProfile();
            await _fetchActiveQueueTicket();
          },
          child: ListView(
            padding: EdgeInsets.symmetric(
              horizontal: rs.w(20),
              vertical: rs.h(12),
            ),
            children: [
              Text(
                'YOUR CAMPUS CARE',
                style: TextStyle(
                  fontSize: rs.sp(10.5),
                  fontWeight: FontWeight.w700,
                  letterSpacing: 2.0,
                  color: textSub,
                ),
              ),
              SizedBox(height: rs.h(4)),
              Text(
                'Hello, $firstName.',
                style: TextStyle(
                  fontSize: rs.sp(28),
                  fontWeight: FontWeight.w800,
                  color: const Color(0xFF191C1A),
                  letterSpacing: -0.5,
                ),
              ),
              SizedBox(height: rs.h(2)),
              Text(
                'Your health pass, ready when you need it.',
                style: TextStyle(fontSize: rs.sp(14), color: textSub),
              ),
              SizedBox(height: rs.h(18)),

              if (_activeQueueTicket != null) ...[
                _buildActiveQueueCard(rs),
                SizedBox(height: rs.h(16)),
              ],

              // Campus Health Pass Card
              Container(
                padding: EdgeInsets.all(rs.w(20)),
                decoration: BoxDecoration(
                  color: const Color(0xFFE2EBE1),
                  borderRadius: BorderRadius.circular(rs.r(24)),
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Icon(Icons.qr_code_2_rounded, size: rs.w(20), color: primaryGreen),
                            SizedBox(width: rs.w(8)),
                            Text(
                              'Campus health pass',
                              style: TextStyle(
                                fontSize: rs.sp(14),
                                fontWeight: FontWeight.w700,
                                color: const Color(0xFF191C1A),
                              ),
                            ),
                          ],
                        ),
                        Icon(Icons.verified_outlined, size: rs.w(18), color: primaryGreen),
                      ],
                    ),
                    SizedBox(height: rs.h(18)),

                    Container(
                      padding: EdgeInsets.all(rs.w(16)),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(rs.r(20)),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.04),
                            blurRadius: 10,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: _loadingQR
                          ? SizedBox(
                              height: qrSize,
                              width: qrSize,
                              child: const Center(
                                child: CircularProgressIndicator(
                                  color: primaryGreen,
                                  strokeWidth: 2,
                                ),
                              ),
                            )
                          : _qrToken.isNotEmpty
                              ? RepaintBoundary(
                                  child: QrImageView(
                                    data: _qrToken,
                                    version: QrVersions.auto,
                                    size: qrSize,
                                  ),
                                )
                              : SizedBox(
                                  height: qrSize,
                                  width: qrSize,
                                  child: const Center(child: Text('Pass offline')),
                                ),
                    ),
                    SizedBox(height: rs.h(14)),

                    Text(
                      'Dynamic QR · Valid for touchless check-in',
                      style: TextStyle(
                        fontSize: rs.sp(11),
                        color: textSub,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    SizedBox(height: rs.h(8)),

                    Text(
                      '${u['first_name']} ${u['last_name']}',
                      style: TextStyle(
                        fontSize: rs.sp(18),
                        fontWeight: FontWeight.w800,
                        color: const Color(0xFF191C1A),
                      ),
                    ),
                    SizedBox(height: rs.h(2)),

                    // ── Role-aware identity line ───────────────
                    // "Student · 22-LN-0123" for students
                    // "Faculty" for faculty
                    // "Support Staff · PSU-NT-2024-0187" for non-teaching
                    Text(
                      identity.roleWithIdentifier,
                      style: TextStyle(fontSize: rs.sp(12), color: textSub),
                    ),

                    if (identity.affiliation.isNotEmpty) ...[
                      SizedBox(height: rs.h(2)),
                      Text(
                        identity.affiliation,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: rs.sp(11.5),
                          color: textSub.withValues(alpha: 0.85),
                        ),
                      ),
                    ],

                    SizedBox(height: rs.h(18)),

                    // Buttons collapse to a column on compact screens.
                    rs.isCompact
                        ? Column(
                            children: [
                              SizedBox(
                                width: double.infinity,
                                child: OutlinedButton(
                                  onPressed: () => _fetchQRPass(),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: primaryGreen,
                                    side: const BorderSide(color: primaryGreen),
                                    shape: const StadiumBorder(),
                                    padding: EdgeInsets.symmetric(vertical: rs.h(10)),
                                  ),
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Text(
                                        'Refresh pass',
                                        style: TextStyle(
                                          fontSize: rs.sp(13),
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      SizedBox(width: rs.w(4)),
                                      const Icon(Icons.north_east_rounded, size: 14),
                                    ],
                                  ),
                                ),
                              ),
                              SizedBox(height: rs.h(8)),
                              SizedBox(
                                width: double.infinity,
                                child: ElevatedButton(
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: primaryGreen,
                                    foregroundColor: Colors.white,
                                    elevation: 0,
                                    shape: const StadiumBorder(),
                                    padding: EdgeInsets.symmetric(vertical: rs.h(12)),
                                  ),
                                  onPressed: () => setState(() => _currentIndex = 1),
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Text(
                                        'Book consultation',
                                        style: TextStyle(
                                          fontSize: rs.sp(13),
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      SizedBox(width: rs.w(4)),
                                      const Icon(Icons.arrow_forward_rounded, size: 14),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          )
                        : Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              TextButton(
                                onPressed: () => _fetchQRPass(),
                                child: Row(
                                  children: [
                                    Text(
                                      'Refresh pass',
                                      style: TextStyle(
                                        color: primaryGreen,
                                        fontSize: rs.sp(13),
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    SizedBox(width: rs.w(4)),
                                    const Icon(
                                      Icons.north_east_rounded,
                                      size: 14,
                                      color: primaryGreen,
                                    ),
                                  ],
                                ),
                              ),
                              ElevatedButton(
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: primaryGreen,
                                  foregroundColor: Colors.white,
                                  elevation: 0,
                                  shape: const StadiumBorder(),
                                  padding: EdgeInsets.symmetric(
                                    horizontal: rs.w(16),
                                    vertical: rs.h(10),
                                  ),
                                ),
                                onPressed: () => setState(() => _currentIndex = 1),
                                child: Row(
                                  children: [
                                    Text(
                                      'Book consultation',
                                      style: TextStyle(
                                        fontSize: rs.sp(13),
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    SizedBox(width: rs.w(4)),
                                    const Icon(Icons.arrow_forward_rounded, size: 14),
                                  ],
                                ),
                              ),
                            ],
                          ),
                  ],
                ),
              ),
              SizedBox(height: rs.h(24)),

              // Shortcut to Care
              Text(
                'A shortcut to your care',
                style: TextStyle(
                  fontSize: rs.sp(16),
                  fontWeight: FontWeight.w800,
                  color: const Color(0xFF191C1A),
                ),
              ),
              SizedBox(height: rs.h(12)),
              Row(
                children: [
                  Expanded(
                    child: GestureDetector(
                      onTap: () => setState(() => _currentIndex = 3),
                      child: Container(
                        padding: EdgeInsets.all(rs.w(16)),
                        decoration: BoxDecoration(
                          color: const Color(0xFFEDEBF7),
                          borderRadius: BorderRadius.circular(rs.r(20)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Icon(
                                  Icons.medication_outlined,
                                  size: rs.w(24),
                                  color: const Color(0xFF5B4EA1),
                                ),
                                const Icon(
                                  Icons.north_east_rounded,
                                  size: 16,
                                  color: Color(0xFF5B4EA1),
                                ),
                              ],
                            ),
                            SizedBox(height: rs.h(14)),
                            Text(
                              'Prescriptions',
                              style: TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: rs.sp(14),
                                color: const Color(0xFF261D52),
                              ),
                            ),
                            SizedBox(height: rs.h(4)),
                            Text(
                              'Your medication, made clear.',
                              style: TextStyle(
                                fontSize: rs.sp(11.5),
                                color: const Color(0xFF5A5285),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  SizedBox(width: rs.w(12)),
                  Expanded(
                    child: GestureDetector(
                      onTap: () => setState(() => _currentIndex = 3),
                      child: Container(
                        padding: EdgeInsets.all(rs.w(16)),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF7F1E6),
                          borderRadius: BorderRadius.circular(rs.r(20)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Icon(
                                  Icons.description_outlined,
                                  size: rs.w(24),
                                  color: const Color(0xFF8C6826),
                                ),
                                const Icon(
                                  Icons.north_east_rounded,
                                  size: 16,
                                  color: Color(0xFF8C6826),
                                ),
                              ],
                            ),
                            SizedBox(height: rs.h(14)),
                            Text(
                              'Medical clearances',
                              style: TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: rs.sp(14),
                                color: const Color(0xFF422F0A),
                              ),
                            ),
                            SizedBox(height: rs.h(4)),
                            Text(
                              'Ready for your next step.',
                              style: TextStyle(
                                fontSize: rs.sp(11.5),
                                color: const Color(0xFF6B5731),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              SizedBox(height: rs.h(24)),

              // Dark green "At a glance" card — role-aware identifier line
              Container(
                padding: EdgeInsets.all(rs.w(20)),
                decoration: BoxDecoration(
                  color: const Color(0xFF244333),
                  borderRadius: BorderRadius.circular(rs.r(24)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            const Icon(
                              Icons.favorite_border_rounded,
                              size: 16,
                              color: Color(0xFFB7DFCA),
                            ),
                            SizedBox(width: rs.w(8)),
                            Text(
                              'YOUR HEALTH AT A GLANCE',
                              style: TextStyle(
                                fontSize: rs.sp(10),
                                letterSpacing: 1.8,
                                fontWeight: FontWeight.w700,
                                color: const Color(0xFFB7DFCA),
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
                    SizedBox(height: rs.h(16)),
                    Row(
                      children: [
                        Container(
                          width: rs.w(44),
                          height: rs.w(44),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.15),
                            shape: BoxShape.circle,
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            _getInitials(u['first_name'] ?? 'P', u['last_name'] ?? 'S'),
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: rs.sp(14),
                            ),
                          ),
                        ),
                        SizedBox(width: rs.w(12)),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${u['first_name']} ${u['last_name']}',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: rs.sp(16),
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              Text(
                                identity.roleWithIdentifier,
                                style: TextStyle(
                                  color: Colors.white70,
                                  fontSize: rs.sp(12),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: rs.h(16)),
                    const Divider(color: Colors.white24, height: 1),
                    SizedBox(height: rs.h(16)),
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  const Icon(
                                    Icons.opacity,
                                    size: 14,
                                    color: Colors.redAccent,
                                  ),
                                  SizedBox(width: rs.w(4)),
                                  Text(
                                    'Blood type',
                                    style: TextStyle(
                                      color: Colors.white70,
                                      fontSize: rs.sp(11),
                                    ),
                                  ),
                                ],
                              ),
                              SizedBox(height: rs.h(4)),
                              Text(
                                hp['blood_type'] ?? '—',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: rs.sp(18),
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Known allergy',
                                style: TextStyle(
                                  color: Colors.white70,
                                  fontSize: rs.sp(11),
                                ),
                              ),
                              SizedBox(height: rs.h(4)),
                              Text(
                                (hp['allergies'] != null &&
                                        hp['allergies'].toString().isNotEmpty)
                                    ? hp['allergies']
                                    : 'None',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: rs.sp(15),
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: rs.h(16)),
                    GestureDetector(
                      onTap: () => setState(() => _currentIndex = 4),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'View full profile',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: rs.sp(13),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const Icon(
                            Icons.arrow_forward_rounded,
                            size: 16,
                            color: Colors.white,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              SizedBox(height: rs.h(20)),

              // Campus Infirmary Info
              Container(
                padding: EdgeInsets.all(rs.w(18)),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(rs.r(20)),
                  border: Border.all(color: const Color(0xFFE2EBE2)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.circle, size: 8, color: primaryGreen),
                        SizedBox(width: rs.w(8)),
                        Text(
                          'Your campus infirmary',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: rs.sp(13),
                            color: const Color(0xFF191C1A),
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: rs.h(12)),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.location_on_outlined, size: rs.w(16), color: textSub),
                        SizedBox(width: rs.w(8)),
                        Expanded(
                          child: Text(
                            'Pangasinan State University\nLingayen Campus, Pangasinan',
                            style: TextStyle(
                              fontSize: rs.sp(12),
                              color: textSub,
                              height: 1.4,
                            ),
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: rs.h(10)),
                    Row(
                      children: [
                        Icon(Icons.access_time_rounded, size: rs.w(16), color: textSub),
                        SizedBox(width: rs.w(8)),
                        Text(
                          'Monday–Friday · 8:00 AM – 5:00 PM',
                          style: TextStyle(fontSize: rs.sp(12), color: textSub),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              SizedBox(height: rs.h(16)),

              // Gentle Reminder
              Container(
                padding: EdgeInsets.all(rs.w(18)),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(rs.r(20)),
                  border: Border.all(color: const Color(0xFFE2EBE2)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.eco_outlined, size: rs.w(20), color: primaryGreen),
                    SizedBox(width: rs.w(12)),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'A gentle reminder',
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: rs.sp(13),
                              color: const Color(0xFF191C1A),
                            ),
                          ),
                          SizedBox(height: rs.h(4)),
                          Text(
                            'Take a breath. Drink some water.\nSmall habits make a big difference.',
                            style: TextStyle(
                              fontSize: rs.sp(12),
                              color: textSub,
                              height: 1.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              SizedBox(height: rs.h(20)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildActiveQueueCard(Rs rs) {
    final ticket = _activeQueueTicket!;
    final status = ticket['status'] ?? 'waiting';
    final ticketNo = ticket['ticket_no'] ?? 'Q-00';
    final isServing = status == 'in-consultation';
    final patientsAhead = ticket['patients_ahead'] ?? 0;
    final waitMins = ticket['estimated_wait_minutes'] ?? 0;

    return Container(
      width: double.infinity,
      padding: EdgeInsets.all(rs.w(18)),
      decoration: BoxDecoration(
        color: isServing ? const Color(0xFFFEF3C7) : const Color(0xFFE5EDE4),
        borderRadius: BorderRadius.circular(rs.r(22)),
        border: Border.all(
          color: isServing ? Colors.amber.shade700 : const Color(0xFF284E3A),
          width: 1.5,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  isServing ? 'NOW SERVING YOUR TICKET!' : 'ACTIVE CLINIC QUEUE',
                  style: TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: rs.sp(11),
                    letterSpacing: 1.5,
                    color: isServing ? Colors.amber.shade900 : const Color(0xFF284E3A),
                  ),
                ),
              ),
              Container(
                padding: EdgeInsets.symmetric(horizontal: rs.w(10), vertical: rs.h(4)),
                decoration: BoxDecoration(
                  color: isServing ? Colors.amber.shade800 : const Color(0xFF284E3A),
                  borderRadius: BorderRadius.circular(rs.r(16)),
                ),
                child: Text(
                  isServing ? 'YOUR TURN' : 'WAITING',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: rs.sp(9.5),
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          SizedBox(height: rs.h(12)),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                ticketNo,
                style: TextStyle(
                  fontSize: rs.sp(36),
                  fontWeight: FontWeight.w900,
                  color: isServing ? Colors.amber.shade900 : const Color(0xFF284E3A),
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    isServing ? 'Proceed To' : 'Patients Ahead',
                    style: TextStyle(
                      fontSize: rs.sp(11),
                      color: const Color(0xFF5A635B),
                    ),
                  ),
                  Text(
                    isServing ? (ticket['clinic_room'] ?? 'Clinic Room 1') : '$patientsAhead',
                    style: TextStyle(
                      fontSize: rs.sp(isServing ? 14 : 20),
                      fontWeight: FontWeight.bold,
                      color: const Color(0xFF191C1A),
                    ),
                  ),
                ],
              ),
            ],
          ),
          SizedBox(height: rs.h(6)),
          Text(
            'Practitioner: ${ticket['doctor_name']} • Est: ~${waitMins > 0 ? waitMins : 5} mins',
            style: TextStyle(fontSize: rs.sp(12), color: const Color(0xFF5A635B)),
          ),
        ],
      ),
    );
  }

  // ===========================================================================
  // TAB 2: EMERGENCY SOS
  // ===========================================================================

  Widget _buildSOSTab() {
    final rs = Rs.of(context);
    const textSub = Color(0xFF5A635B);
    const textMain = Color(0xFF191C1A);
    const primaryGreen = Color(0xFF284E3A);

    const peachCardBg = Color(0xFFF9EDE5);
    const demoBadgeBg = Color(0xFFF2D9CE);
    const demoBadgeText = Color(0xFF8D3F33);
    const sirenCircleBg = Color(0xFFF1D8CC);
    const activeCrimson = Color(0xFFA03B30);
    const activeHalo = Color(0xFFF4C8C1);
    const inactiveCircle = Color(0xFFBFA298);
    const inactiveHalo = Color(0xFFE8D8CF);

    final isOffline = !ConnectivityService().isOnline;
    final maxContentWidth = rs.isTablet ? 560.0 : double.infinity;

    final outerSize = rs.w(220).clamp(170.0, 250.0);
    final progressSize = outerSize * 0.80;
    final innerSize = outerSize * 0.74;

    return SafeArea(
      child: Center(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: maxContentWidth),
          child: SingleChildScrollView(
            padding: EdgeInsets.symmetric(
              horizontal: rs.w(20),
              vertical: rs.h(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  "WE'RE HERE WHEN YOU NEED US",
                  style: TextStyle(
                    fontSize: rs.sp(10.5),
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.8,
                    color: textSub,
                  ),
                ),
                SizedBox(height: rs.h(4)),
                Text(
                  'Emergency SOS',
                  style: TextStyle(
                    fontSize: rs.sp(30),
                    fontWeight: FontWeight.w800,
                    color: textMain,
                    letterSpacing: -0.5,
                  ),
                ),
                SizedBox(height: rs.h(18)),

                if (isOffline) ...[
                  Container(
                    margin: EdgeInsets.only(bottom: rs.h(16)),
                    padding: EdgeInsets.all(rs.w(16)),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFDE8E8),
                      border: Border.all(color: const Color(0xFFF8B4B4)),
                      borderRadius: BorderRadius.circular(rs.r(16)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(
                              Icons.wifi_off_rounded,
                              color: const Color(0xFF7A2E26),
                              size: rs.w(20),
                            ),
                            SizedBox(width: rs.w(8)),
                            Expanded(
                              child: Text(
                                'You are currently offline',
                                style: TextStyle(
                                  fontSize: rs.sp(14),
                                  fontWeight: FontWeight.w800,
                                  color: const Color(0xFF7A2E26),
                                ),
                              ),
                            ),
                          ],
                        ),
                        SizedBox(height: rs.h(8)),
                        Text(
                          "In-app SOS can't reach the campus server without internet. But these buttons work with no data connection:",
                          style: TextStyle(
                            fontSize: rs.sp(12.5),
                            color: const Color(0xFF7A2E26),
                            height: 1.4,
                          ),
                        ),
                        SizedBox(height: rs.h(14)),
                        _buildOfflineCallButton(rs, '📞  Call 911', '911'),
                        SizedBox(height: rs.h(8)),
                        FutureBuilder<Map<String, dynamic>?>(
                          future: OfflineSosService().readCachedEmergencyInfo(),
                          builder: (ctx, snap) {
                            final info = snap.data;
                            final name = info?['contact_name'] ?? 'Emergency contact';
                            final phone = info?['contact_phone'];
                            if (phone == null) return const SizedBox.shrink();
                            return Column(
                              children: [
                                _buildOfflineCallButton(rs, '📞  Call $name', phone),
                                SizedBox(height: rs.h(8)),
                                _buildOfflineSmsButton(
                                  rs,
                                  name,
                                  phone,
                                  'EMERGENCY: I need help. This is an automated alert from Valetudo HealthLink.',
                                ),
                              ],
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                ],

                Container(
                  width: double.infinity,
                  padding: EdgeInsets.symmetric(
                    horizontal: rs.w(22),
                    vertical: rs.h(26),
                  ),
                  decoration: BoxDecoration(
                    color: peachCardBg,
                    borderRadius: BorderRadius.circular(rs.r(28)),
                  ),
                  child: Column(
                    children: [
                      Container(
                        padding: EdgeInsets.symmetric(
                          horizontal: rs.w(14),
                          vertical: rs.h(6),
                        ),
                        decoration: BoxDecoration(
                          color: demoBadgeBg,
                          borderRadius: BorderRadius.circular(rs.r(20)),
                        ),
                        child: Text(
                          'DEMO ONLY • NOT AN EMERGENCY SERVICE',
                          style: TextStyle(
                            fontSize: rs.sp(10),
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.0,
                            color: demoBadgeText,
                          ),
                        ),
                      ),
                      SizedBox(height: rs.h(20)),

                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Container(
                            width: rs.w(38),
                            height: rs.w(38),
                            decoration: const BoxDecoration(
                              color: sirenCircleBg,
                              shape: BoxShape.circle,
                            ),
                            child: Icon(
                              Icons.notifications_active_outlined,
                              size: rs.w(20),
                              color: demoBadgeText,
                            ),
                          ),
                          SizedBox(width: rs.w(10)),
                          Flexible(
                            child: Text(
                              'Your campus SOS',
                              style: TextStyle(
                                fontSize: rs.sp(20),
                                fontWeight: FontWeight.w800,
                                color: textMain,
                                letterSpacing: -0.3,
                              ),
                            ),
                          ),
                        ],
                      ),
                      SizedBox(height: rs.h(12)),

                      Padding(
                        padding: EdgeInsets.symmetric(horizontal: rs.w(10)),
                        child: Text(
                          'In the connected app, your campus response team would receive your location and essential medical details.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: rs.sp(13),
                            color: textSub,
                            height: 1.45,
                          ),
                        ),
                      ),
                      SizedBox(height: rs.h(20)),

                      Padding(
                        padding: EdgeInsets.symmetric(horizontal: rs.w(4)),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SizedBox(
                              width: rs.w(22),
                              height: rs.w(22),
                              child: Checkbox(
                                value: _sosConsent,
                                activeColor: activeCrimson,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(rs.r(4)),
                                ),
                                side: BorderSide(
                                  color: _sosConsent
                                      ? activeCrimson
                                      : const Color(0xFFC7AAA0),
                                  width: 1.8,
                                ),
                                onChanged: (val) =>
                                    setState(() => _sosConsent = val ?? false),
                              ),
                            ),
                            SizedBox(width: rs.w(12)),
                            Expanded(
                              child: Text(
                                'I consent to sharing my location and medical details with authorized campus responders.',
                                style: TextStyle(
                                  fontSize: rs.sp(12.5),
                                  color: textSub,
                                  height: 1.4,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      SizedBox(height: rs.h(26)),

                      GestureDetector(
                        onTapDown: (_) => _startHold(),
                        onTapUp: (_) => _cancelHold(),
                        onTapCancel: () => _cancelHold(),
                        child: ValueListenableBuilder<double>(
                          valueListenable: _holdProgressNotifier,
                          builder: (context, progress, _) {
                            return Container(
                              width: outerSize,
                              height: outerSize,
                              decoration: BoxDecoration(
                                color: _sosConsent ? activeHalo : inactiveHalo,
                                shape: BoxShape.circle,
                              ),
                              alignment: Alignment.center,
                              child: Stack(
                                alignment: Alignment.center,
                                children: [
                                  if (progress > 0.0)
                                    SizedBox(
                                      width: progressSize,
                                      height: progressSize,
                                      child: CircularProgressIndicator(
                                        value: progress,
                                        strokeWidth: 5,
                                        valueColor:
                                            const AlwaysStoppedAnimation<Color>(
                                          Colors.white,
                                        ),
                                        backgroundColor: Colors.transparent,
                                      ),
                                    ),
                                  Container(
                                    width: innerSize,
                                    height: innerSize,
                                    decoration: BoxDecoration(
                                      color: _sosConsent ? activeCrimson : inactiveCircle,
                                      shape: BoxShape.circle,
                                      boxShadow: _isHolding
                                          ? [
                                              BoxShadow(
                                                color:
                                                    activeCrimson.withValues(alpha: 0.45),
                                                blurRadius: 20,
                                                spreadRadius: 4,
                                              )
                                            ]
                                          : null,
                                    ),
                                    child: Column(
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        Icon(
                                          Icons.back_hand_rounded,
                                          size: rs.w(30),
                                          color: Colors.white,
                                        ),
                                        SizedBox(height: rs.h(6)),
                                        Text(
                                          'HOLD TO',
                                          style: TextStyle(
                                            fontSize: rs.sp(11),
                                            fontWeight: FontWeight.w800,
                                            letterSpacing: 1.2,
                                            color: Colors.white,
                                          ),
                                        ),
                                        Text(
                                          'TRY SOS',
                                          style: TextStyle(
                                            fontSize: rs.sp(18),
                                            fontWeight: FontWeight.w900,
                                            letterSpacing: 0.8,
                                            color: Colors.white,
                                          ),
                                        ),
                                        SizedBox(height: rs.h(2)),
                                        Text(
                                          _isHolding
                                              ? '${((1.0 - progress) * 2.5).toStringAsFixed(1)}s remaining'
                                              : 'for 2.5 seconds',
                                          style: TextStyle(
                                            fontSize: rs.sp(11),
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
                      SizedBox(height: rs.h(18)),

                      Text(
                        _sosStatusMessage.isNotEmpty
                            ? _sosStatusMessage
                            : 'No location is collected or shared in this preview.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: rs.sp(12),
                          fontWeight: _sosStatusMessage.isNotEmpty
                              ? FontWeight.w700
                              : FontWeight.w500,
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
                SizedBox(height: rs.h(20)),

                Container(
                  width: double.infinity,
                  padding: EdgeInsets.symmetric(
                    horizontal: rs.w(20),
                    vertical: rs.h(18),
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(rs.r(22)),
                    border: Border.all(color: const Color(0xFFE2EBE2)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Text(
                        'For an out of campus emergency, call emergency services now.',
                        style: TextStyle(
                          fontSize: rs.sp(13),
                          color: textSub,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      SizedBox(height: rs.h(14)),
                      SizedBox(
                        width: double.infinity,
                        height: rs.h(48).clamp(44.0, 54.0),
                        child: ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFFE2EBE1),
                            foregroundColor: primaryGreen,
                            elevation: 0,
                            shape: const StadiumBorder(),
                          ),
                          onPressed: () => _launchDialer('911'),
                          icon: const Icon(
                            Icons.phone_outlined,
                            size: 18,
                            color: primaryGreen,
                          ),
                          label: Text(
                            'Call 911',
                            style: TextStyle(
                              fontSize: rs.sp(14),
                              fontWeight: FontWeight.w700,
                              color: primaryGreen,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                SizedBox(height: rs.h(24)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildOfflineCallButton(Rs rs, String label, String number) {
    return SizedBox(
      width: double.infinity,
      height: rs.h(48).clamp(44.0, 54.0),
      child: ElevatedButton(
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF7A2E26),
          foregroundColor: Colors.white,
          shape: const StadiumBorder(),
          elevation: 0,
        ),
        onPressed: () => OfflineSosService().dialNumber(number),
        child: Text(
          label,
          style: TextStyle(fontSize: rs.sp(14), fontWeight: FontWeight.w700),
        ),
      ),
    );
  }

  Widget _buildOfflineSmsButton(Rs rs, String recipientLabel, String phone, String body) {
    return SizedBox(
      width: double.infinity,
      height: rs.h(44).clamp(40.0, 50.0),
      child: OutlinedButton(
        style: OutlinedButton.styleFrom(
          foregroundColor: const Color(0xFF7A2E26),
          side: const BorderSide(color: Color(0xFF7A2E26)),
          shape: const StadiumBorder(),
        ),
        onPressed: () => OfflineSosService().composeEmergencySms(phone, body: body),
        child: Text(
          '💬  Text $recipientLabel',
          style: TextStyle(fontSize: rs.sp(13), fontWeight: FontWeight.w700),
        ),
      ),
    );
  }

  // ===========================================================================
  // TAB 4: PROFILE
  // ===========================================================================

  Widget _buildProfileTab(String initials) {
    final rs = Rs.of(context);
    const primaryGreen = Color(0xFF284E3A);
    const softSage = Color(0xFFE5EDE4);
    const textSub = Color(0xFF5A635B);

    if (_loadingProfile && _profileData == null) {
      return const Center(child: CircularProgressIndicator(color: primaryGreen));
    }

    final hp = _profileData?['healthProfile'] ?? {};
    final u = _profileData?['user'] ?? widget.user;
    final identity = _identity;
    final maxContentWidth = rs.isTablet ? 560.0 : double.infinity;

    List<String> immunizations = [];
    final rawImm = hp['immunization_history'];
    if (rawImm is List) {
      immunizations = rawImm.map((e) => e.toString()).toList();
    } else if (rawImm is String && rawImm.isNotEmpty) {
      try {
        final decoded = jsonDecode(rawImm);
        if (decoded is List) {
          immunizations = decoded.map((e) => e.toString()).toList();
        }
      } catch (_) {
        immunizations = [rawImm];
      }
    }

    return Center(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxContentWidth),
        child: RefreshIndicator(
          color: primaryGreen,
          onRefresh: () async {
            await _fetchProfile();
            await _checkPrivacyConsent();
          },
          child: ListView(
            padding: EdgeInsets.symmetric(
              horizontal: rs.w(20),
              vertical: rs.h(12),
            ),
            children: [
              Text(
                "A SPACE THAT'S YOURS",
                style: TextStyle(
                  fontSize: rs.sp(10.5),
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.8,
                  color: textSub,
                ),
              ),
              SizedBox(height: rs.h(4)),
              Text(
                'Your health. Your profile.',
                style: TextStyle(
                  fontSize: rs.sp(28),
                  fontWeight: FontWeight.w800,
                  color: const Color(0xFF191C1A),
                  letterSpacing: -0.5,
                ),
              ),
              SizedBox(height: rs.h(2)),
              Text(
                'The important details that help us care for you.',
                style: TextStyle(fontSize: rs.sp(14), color: textSub),
              ),
              SizedBox(height: rs.h(18)),

              // User card — role-aware
              Container(
                padding: EdgeInsets.all(rs.w(20)),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(rs.r(24)),
                  border: Border.all(color: const Color(0xFFE2EBE2)),
                ),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Container(
                          width: rs.w(54).clamp(46.0, 60.0),
                          height: rs.w(54).clamp(46.0, 60.0),
                          decoration: const BoxDecoration(
                            color: Color(0xFFE6DDCF),
                            shape: BoxShape.circle,
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            initials,
                            style: TextStyle(
                              fontSize: rs.sp(18),
                              fontWeight: FontWeight.w800,
                              color: const Color(0xFF4A4133),
                            ),
                          ),
                        ),
                        SizedBox(width: rs.w(14)),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${u['first_name']} ${u['last_name']}',
                                style: TextStyle(
                                  fontSize: rs.sp(18),
                                  fontWeight: FontWeight.w800,
                                  color: const Color(0xFF191C1A),
                                ),
                              ),
                              SizedBox(height: rs.h(2)),
                              // "Student · 22-LN-0123" / "Faculty" /
                              // "Support Staff · PSU-NT-2024-0187"
                              Text(
                                identity.roleWithIdentifier,
                                style: TextStyle(
                                  fontSize: rs.sp(12.5),
                                  color: textSub,
                                ),
                              ),
                              if (identity.affiliation.isNotEmpty)
                                Text(
                                  identity.affiliation,
                                  style: TextStyle(
                                    fontSize: rs.sp(12),
                                    color: textSub,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: rs.h(16)),
                    SizedBox(
                      width: double.infinity,
                      height: rs.h(44).clamp(40.0, 50.0),
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: softSage,
                          foregroundColor: primaryGreen,
                          elevation: 0,
                          shape: const StadiumBorder(),
                        ),
                        onPressed: () => setState(() => _currentIndex = 0),
                        icon: const Icon(Icons.qr_code_2_rounded, size: 18),
                        label: Text(
                          'View health pass',
                          style: TextStyle(
                            fontSize: rs.sp(13),
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              SizedBox(height: rs.h(20)),

              // Clinical details
              Container(
                padding: EdgeInsets.all(rs.w(20)),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(rs.r(24)),
                  border: Border.all(color: const Color(0xFFE2EBE2)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Clinical details',
                      style: TextStyle(
                        fontSize: rs.sp(16),
                        fontWeight: FontWeight.w800,
                        color: const Color(0xFF191C1A),
                      ),
                    ),
                    SizedBox(height: rs.h(16)),
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Blood type',
                                style: TextStyle(fontSize: rs.sp(11.5), color: textSub),
                              ),
                              SizedBox(height: rs.h(4)),
                              Text(
                                hp['blood_type'] ?? '—',
                                style: TextStyle(
                                  fontSize: rs.sp(17),
                                  fontWeight: FontWeight.w800,
                                  color: const Color(0xFF191C1A),
                                ),
                              ),
                            ],
                          ),
                        ),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Known allergy',
                                style: TextStyle(fontSize: rs.sp(11.5), color: textSub),
                              ),
                              SizedBox(height: rs.h(4)),
                              Text(
                                (hp['allergies'] != null &&
                                        hp['allergies'].toString().isNotEmpty)
                                    ? hp['allergies']
                                    : 'None',
                                style: TextStyle(
                                  fontSize: rs.sp(15),
                                  fontWeight: FontWeight.w700,
                                  color: const Color(0xFF7A2E26),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: rs.h(16)),
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Condition',
                                style: TextStyle(fontSize: rs.sp(11.5), color: textSub),
                              ),
                              SizedBox(height: rs.h(4)),
                              Text(
                                hp['chronic_conditions'] ?? 'None',
                                style: TextStyle(
                                  fontSize: rs.sp(14),
                                  fontWeight: FontWeight.w600,
                                  color: const Color(0xFF191C1A),
                                ),
                              ),
                            ],
                          ),
                        ),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Height',
                                style: TextStyle(fontSize: rs.sp(11.5), color: textSub),
                              ),
                              SizedBox(height: rs.h(4)),
                              Text(
                                hp['height'] != null ? '${hp['height']} cm' : '—',
                                style: TextStyle(
                                  fontSize: rs.sp(14),
                                  fontWeight: FontWeight.w600,
                                  color: const Color(0xFF191C1A),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: rs.h(16)),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Weight',
                          style: TextStyle(fontSize: rs.sp(11.5), color: textSub),
                        ),
                        SizedBox(height: rs.h(4)),
                        Text(
                          hp['weight'] != null ? '${hp['weight']} kg' : '—',
                          style: TextStyle(
                            fontSize: rs.sp(14),
                            fontWeight: FontWeight.w600,
                            color: const Color(0xFF191C1A),
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: rs.h(14)),
                    Row(
                      children: [
                        Icon(Icons.update, size: rs.w(13), color: textSub),
                        SizedBox(width: rs.w(5)),
                        Expanded(
                          child: Text(
                            'Last verified by clinic staff: ${_formatRelativeDate(hp['updated_at']?.toString())}',
                            style: TextStyle(
                              fontSize: rs.sp(11),
                              color: textSub,
                              fontStyle: FontStyle.italic,
                            ),
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: rs.h(14)),
                    Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: rs.w(14),
                        vertical: rs.h(10),
                      ),
                      decoration: BoxDecoration(
                        color: softSage,
                        borderRadius: BorderRadius.circular(rs.r(14)),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.verified_outlined,
                              size: rs.w(16), color: primaryGreen),
                          SizedBox(width: rs.w(8)),
                          Expanded(
                            child: Text(
                              'Clinical details can only be updated in person by campus infirmary staff.',
                              style: TextStyle(
                                fontSize: rs.sp(11.5),
                                color: primaryGreen,
                                fontWeight: FontWeight.w500,
                                height: 1.3,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              SizedBox(height: rs.h(20)),

              // Immunizations
              Container(
                padding: EdgeInsets.all(rs.w(20)),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(rs.r(24)),
                  border: Border.all(color: const Color(0xFFE2EBE2)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Immunizations',
                      style: TextStyle(
                        fontSize: rs.sp(16),
                        fontWeight: FontWeight.w800,
                        color: const Color(0xFF191C1A),
                      ),
                    ),
                    SizedBox(height: rs.h(14)),
                    if (immunizations.isEmpty)
                      Text(
                        'No records logged.',
                        style: TextStyle(fontSize: rs.sp(13), color: textSub),
                      )
                    else
                      ...immunizations.map(
                        (imm) => Padding(
                          padding: EdgeInsets.only(bottom: rs.h(10)),
                          child: Row(
                            children: [
                              Container(
                                padding: EdgeInsets.all(rs.w(4)),
                                decoration: BoxDecoration(
                                  color: softSage,
                                  borderRadius: BorderRadius.circular(rs.r(6)),
                                ),
                                child: Icon(
                                  Icons.check,
                                  size: rs.w(14),
                                  color: primaryGreen,
                                ),
                              ),
                              SizedBox(width: rs.w(10)),
                              Expanded(
                                child: Text(
                                  imm,
                                  style: TextStyle(
                                    fontSize: rs.sp(13.5),
                                    fontWeight: FontWeight.w600,
                                    color: const Color(0xFF191C1A),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              SizedBox(height: rs.h(20)),

              // Contact details
              Container(
                padding: EdgeInsets.all(rs.w(20)),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(rs.r(24)),
                  border: Border.all(color: const Color(0xFFE2EBE2)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Contact details',
                          style: TextStyle(
                            fontSize: rs.sp(16),
                            fontWeight: FontWeight.w800,
                            color: const Color(0xFF191C1A),
                          ),
                        ),
                        TextButton(
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
                            if (updated == true) _fetchProfile();
                          },
                          child: Text(
                            'Edit',
                            style: TextStyle(
                              color: primaryGreen,
                              fontWeight: FontWeight.w700,
                              fontSize: rs.sp(14),
                            ),
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: rs.h(8)),
                    Text(
                      'YOUR MOBILE NUMBER',
                      style: TextStyle(
                        fontSize: rs.sp(10.5),
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.2,
                        color: textSub,
                      ),
                    ),
                    SizedBox(height: rs.h(4)),
                    Text(
                      u['phone'] ?? '—',
                      style: TextStyle(
                        fontSize: rs.sp(14),
                        fontWeight: FontWeight.w600,
                        color: const Color(0xFF191C1A),
                      ),
                    ),
                    SizedBox(height: rs.h(14)),
                    Text(
                      'EMERGENCY CONTACT',
                      style: TextStyle(
                        fontSize: rs.sp(10.5),
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.2,
                        color: textSub,
                      ),
                    ),
                    SizedBox(height: rs.h(4)),
                    Text(
                      hp['emergency_contact_name'] ?? '—',
                      style: TextStyle(
                        fontSize: rs.sp(14),
                        fontWeight: FontWeight.w600,
                        color: const Color(0xFF191C1A),
                      ),
                    ),
                    Text(
                      hp['emergency_contact_phone'] ?? '—',
                      style: TextStyle(fontSize: rs.sp(13), color: textSub),
                    ),
                  ],
                ),
              ),
              SizedBox(height: rs.h(20)),

              // Settings links
              Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(rs.r(24)),
                  border: Border.all(color: const Color(0xFFE2EBE2)),
                ),
                child: Column(
                  children: [
                    ListTile(
                      leading: Icon(
                        Icons.lock_outline_rounded,
                        size: rs.w(20),
                        color: primaryGreen,
                      ),
                      title: Text(
                        'Change password',
                        style: TextStyle(
                          fontSize: rs.sp(14),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      trailing: Icon(
                        Icons.chevron_right,
                        size: rs.w(18),
                        color: textSub,
                      ),
                      onTap: () => Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => const ChangePasswordScreen()),
                      ),
                    ),
                    const Divider(height: 1, indent: 52),
                    ListTile(
                      leading: Icon(
                        Icons.privacy_tip_outlined,
                        size: rs.w(20),
                        color: primaryGreen,
                      ),
                      title: Text(
                        'Data privacy terms (R.A. 10173)',
                        style: TextStyle(
                          fontSize: rs.sp(14),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      subtitle: Text(
                        _hasConsented
                            ? 'Consent active · Encrypted with AES-256'
                            : 'Consent pending verification',
                        style: TextStyle(
                          fontSize: rs.sp(11.5),
                          color: _hasConsented
                              ? const Color(0xFF284E3A)
                              : const Color(0xFF7A2E26),
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (_hasConsented)
                            TextButton(
                              onPressed: _showRevokeDialog,
                              child: Text(
                                'Revoke',
                                style: TextStyle(
                                  color: const Color(0xFF7A2E26),
                                  fontSize: rs.sp(12),
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          Icon(
                            Icons.chevron_right,
                            size: rs.w(18),
                            color: textSub,
                          ),
                        ],
                      ),
                      onTap: () => _showConsentModal(isMandatory: false),
                    ),
                    const Divider(height: 1, indent: 52),
                    ListTile(
                      leading: Icon(
                        Icons.logout_rounded,
                        size: rs.w(20),
                        color: Colors.red,
                      ),
                      title: Text(
                        'Sign out of portal',
                        style: TextStyle(
                          fontSize: rs.sp(14),
                          fontWeight: FontWeight.w600,
                          color: Colors.red,
                        ),
                      ),
                      trailing: Icon(
                        Icons.chevron_right,
                        size: rs.w(18),
                        color: Colors.red,
                      ),
                      onTap: _handleSignOut,
                    ),
                  ],
                ),
              ),
              SizedBox(height: rs.h(28)),
            ],
          ),
        ),
      ),
    );
  }
}