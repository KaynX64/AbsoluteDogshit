// mobile/lib/screens/patient_portal_screen.dart
import 'dart:async';

import '../services/mobile_session_data.dart';

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../theme/app_palette.dart';
import '../theme/account_theme_controller.dart';
import '../widgets/account_settings_button.dart';
import '../widgets/sign_out_confirmation.dart';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:geolocator/geolocator.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config/api_config.dart';
import '../utils/responsive.dart';
import '../widgets/session_timeout_listener.dart';
import '../widgets/valetudo_logo.dart';
import '../services/emergency_alert_service.dart';
import '../widgets/responder_hub.dart';
import '../services/offline_sos_service.dart';
import '../services/connectivity_service.dart';
import 'login_screen.dart';
import 'edit_profile_screen.dart';
import 'consultation_scheduler_screen.dart';
import 'documents_viewer_screen.dart';
import 'change_password_screen.dart';

/// Role-aware identity presentation for the mobile portal.
///
/// The mobile portal is currently reachable by any non-responder role
/// (students, faculty, non-teaching staff, and clinical staff who land
/// on it). Each population has different profile columns, so a single
/// hardcoded display line shows fabricated data for most of them.
/// This helper reads the primary_role and produces the right three
/// display strings for whichever role is logged in.
class _PatientIdentity {
  final String roleWord; // "Student" | "Faculty" | "Doctor" | ...
  final String identifier; // student_no | faculty_no | employee_no | admin_no | license_no | ''
  final String affiliation; // "BS Info Tech · Year 3" | "Dept · Position" | ...

  const _PatientIdentity({
    required this.roleWord,
    required this.identifier,
    required this.affiliation,
  });

  /// Joins non-empty parts with a separator.
  ///
  /// Static (not a closure inside the factory) so the getters below can
  /// call it. Dart closures don't leak out of the scope they're declared
  /// in, which is why putting this inside `fromProfile` broke the build.
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

    String trimmed(dynamic v) => (v ?? '').toString().trim();

    switch (role) {
      case 'FACULTY':
        return _PatientIdentity(
          roleWord: 'Faculty',
          identifier: trimmed(u['faculty_no']),
          affiliation: _joinNonEmpty([u['department'], u['position']]),
        );

      case 'NON_TEACHING':
        return _PatientIdentity(
          roleWord: 'Support Staff',
          identifier: trimmed(u['employee_no']),
          affiliation: _joinNonEmpty([u['department'], u['position']]),
        );

      case 'ADMIN':
        return _PatientIdentity(
          roleWord: 'Administrator',
          identifier: trimmed(u['admin_no']),
          affiliation: _joinNonEmpty([u['specialty'], u['department']]),
        );

      case 'DOCTOR':
        return _PatientIdentity(
          roleWord: 'Doctor',
          identifier: trimmed(u['license_no']),
          affiliation: _joinNonEmpty([u['specialty'], u['department']]),
        );

      case 'DENTIST':
        return _PatientIdentity(
          roleWord: 'Dentist',
          identifier: trimmed(u['license_no']),
          affiliation: _joinNonEmpty([u['specialty'], u['department']]),
        );

      case 'NURSE':
        return _PatientIdentity(
          roleWord: 'Nurse',
          identifier: trimmed(u['license_no']),
          affiliation: _joinNonEmpty([u['specialty'], u['department']]),
        );

      case 'EMERGENCY_RESPONDER':
        return _PatientIdentity(
          roleWord: 'Responder',
          identifier: '',
          affiliation: _joinNonEmpty([u['department']]),
        );

      case 'STUDENT':
      default:
        return _PatientIdentity(
          roleWord: 'Student',
          identifier: trimmed(u['student_no']),
          affiliation: _joinNonEmpty([
            u['course'],
            if (u['year_level'] != null) 'Year ${u['year_level']}',
          ]),
        );
    }
  }

  /// Compact form for the health pass: "Student · 22-LN-0123" or
  /// "Faculty · PSU-FAC-2024-0451" or just "Responder".
  String get roleWithIdentifier =>
      identifier.isEmpty ? roleWord : '$roleWord · $identifier';

  /// Verbose form for the profile header.
  String get fullSubtitle => _joinNonEmpty([roleWord, identifier, affiliation]);
}

class PatientPortalScreen extends StatefulWidget {
  final Map<String, dynamic> user;
  final Map<String, dynamic>? initialProfile;
  const PatientPortalScreen({
    super.key,
    required this.user,
    this.initialProfile,
    this.client,
  });
  final http.Client? client;

  @override
  State<PatientPortalScreen> createState() => _PatientPortalScreenState();
}

class _PatientPortalScreenState extends State<PatientPortalScreen>
    with WidgetsBindingObserver {
  final _data = MobileSessionData.instance;
  late final int _generation;
  bool _foreground = true;
  bool get _sessionCurrent => mounted && _data.isCurrent(_generation);
  String? get _account => widget.user['user_id']?.toString();
  Future<void>? _queueRequest;
  bool _queueRefreshQueued = false;
  Future<Map<String, dynamic>?>? _emergencyInfo;
  late final Future<void> _dashboardReady;
  int _currentIndex = 0;
  final _storage = const FlutterSecureStorage();
  http.Client get _client => widget.client ?? ApiConfig.client;

  String _qrToken = '';
  bool _loadingQR = false;
  DateTime? _qrExpiresAt;
  Timer? _qrTimer;

  Map<String, dynamic>? _profileData;
  bool _loadingProfile = false;

  bool _hasConsented = false;

  Map<String, dynamic>? _activeQueueTicket;
  Timer? _queuePollingTimer;
  io.Socket? _socket;
  String _previousQueueStatus = '';

  bool _sosConsent = false;
  bool _isHolding = false;
  final ValueNotifier<double> _holdProgressNotifier = ValueNotifier<double>(
    0.0,
  );
  Timer? _holdTimer;
  Timer? _sosRetry;
  bool _isDispatchingSOS = false;
  String _sosStatusMessage = '';

  /// Role-aware display strings, recomputed on every build from the
  /// currently loaded profile. Cheap enough — no caching needed.
  _PatientIdentity get _identity =>
      _PatientIdentity.fromProfile(_profileData, widget.user);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _generation = _data.generation;
    _foreground =
        WidgetsBinding.instance.lifecycleState == null ||
        WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed;
    final consent = _checkPrivacyConsent();
    final qr = _fetchQRPass();
    final initialProfile = widget.initialProfile;
    if (initialProfile != null) {
      _profileData = initialProfile;
      unawaited(_cacheEmergencyInfo(initialProfile));
    }
    final profile = initialProfile == null
        ? _fetchProfile()
        : Future<void>.value();
    _dashboardReady = Future.wait([
      consent,
      qr,
      profile,
      _fetchActiveQueueTicket(),
    ]).then((_) => _schedulePreload());
    _initQueueSocket();
    ConnectivityService().addListener(_onConnectivityChanged);
    unawaited(_replayQueuedSosEvents());

    _updateQueuePolling();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    ConnectivityService().removeListener(_onConnectivityChanged);
    _queuePollingTimer?.cancel();
    _qrTimer?.cancel();
    _sosRetry?.cancel();
    _holdTimer?.cancel();
    _holdProgressNotifier.dispose();
    _socket?.dispose();
    super.dispose();
  }

  // ===========================================================================
  // CONNECTIVITY + OFFLINE SOS REPLAY
  // ===========================================================================

  void _onConnectivityChanged() {
    _updateQueuePolling();
    if (_foreground && ConnectivityService().isOnline) {
      unawaited(_replayQueuedSosEvents());
      unawaited(_fetchActiveQueueTicket(silent: true));
      unawaited(_dashboardReady.then((_) => _schedulePreload()));
      _refreshPassIfNeeded();
    }
    if (mounted) setState(() {});
  }

  void _updateQueuePolling() {
    _queuePollingTimer?.cancel();
    _queuePollingTimer = null;
    if (!_foreground || !ConnectivityService().isOnline) return;
    _queuePollingTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _fetchActiveQueueTicket(silent: true),
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    _updateQueuePolling();
    if (_foreground) {
      _fetchActiveQueueTicket(silent: true);
      unawaited(_dashboardReady.then((_) => _schedulePreload()));
      unawaited(_replayQueuedSosEvents());
      _refreshPassIfNeeded();
    } else {
      _sosRetry?.cancel();
    }
  }

  void _schedulePreload() {
    if (!mounted ||
        !_data.isCurrent(_generation) ||
        !_hasConsented ||
        !_foreground ||
        !ConnectivityService().isOnline) {
      return;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted &&
          _data.isCurrent(_generation) &&
          _hasConsented &&
          _foreground &&
          ConnectivityService().isOnline) {
        unawaited(
          _data.preload(
            canContinue: () =>
                mounted && _foreground && ConnectivityService().isOnline,
          ),
        );
      }
    });
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  Future<void> _replayQueuedSosEvents() async {
    final account = _account;
    if (!_sessionCurrent || !_foreground || account == null) return;
    try {
      final token = await _storage.read(key: 'jwt_token');
      if (!_sessionCurrent || token == null) return;
      final online = ConnectivityService().isOnline;
      final result = await OfflineSosService().sync(
        account: account,
        token: token,
        client: _client,
        online: online,
        isCurrent: () => _sessionCurrent && _foreground && !_signOutInProgress,
      );
      if (!mounted || !_data.isCurrent(_generation) || _signOutInProgress) {
        return;
      }
      if (result.message case final message?) {
        setState(() => _sosStatusMessage = message);
        if (result.accepted + result.unsent > 0 && _currentIndex != 2) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(message)));
        }
      }
      _sosRetry?.cancel();
      if (_foreground &&
          online &&
          !result.reauthenticate &&
          result.pending > 0) {
        _sosRetry = Timer(
          result.retryIn ?? const Duration(seconds: 1),
          _replayQueuedSosEvents,
        );
      }
    } catch (_) {
      if (_sessionCurrent) {
        setState(
          () => _sosStatusMessage = 'Could not read the SOS queue. Use the call buttons if you need help now.',
        );
      }
    }
  }

  // ===========================================================================
  // R.A. 10173 CONSENT
  // ===========================================================================

  Future<void> _checkPrivacyConsent() async {
    final token = await _storage.read(key: 'jwt_token');
    try {
      final res = await _client
          .get(
            Uri.parse('${ApiConfig.baseUrl}/api/privacy/status'),
            headers: {'Authorization': 'Bearer $token'},
          )
          .timeout(const Duration(seconds: 10));
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final consented = data['hasConsented'] == true;
        if (mounted && _data.isCurrent(_generation)) {
          setState(() => _hasConsented = consented);
          _data.consented = consented;
          if (!consented) _showConsentModal(isMandatory: true);
        }
      }
    } catch (_) {}
  }

  Future<void> _recordConsent() async {
    final token = await _storage.read(key: 'jwt_token');
    try {
      final res = await _client.post(
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
        if (!mounted || !_data.isCurrent(_generation)) return;
        setState(() => _hasConsented = true);
        _data.consented = true;
        await _fetchQRPass();
        await _fetchProfile();
        await _fetchActiveQueueTicket();
        await _dashboardReady;
        _schedulePreload();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text(
                'Privacy consent recorded under R.A. 10173. Access restored.',
              ),
              backgroundColor: AppPalette.of(context).background(0xFF284E3A),
            ),
          );
        }
      }
    } catch (_) {}
  }

  Future<void> _revokeConsent() async {
    final token = await _storage.read(key: 'jwt_token');
    try {
      final res = await _client.post(
        Uri.parse('${ApiConfig.baseUrl}/api/privacy/revoke'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
      );
      if (res.statusCode == 200 && _sessionCurrent) {
        final account = _account;
        if (account != null) {
          await OfflineSosService()
              .cacheEmergencyInfo(account)
              .catchError((Object _) {});
        }
        if (_sessionCurrent) await _signOut();
      }
    } catch (_) {}
  }

  void _showConsentModal({bool isMandatory = false}) {
    final rs = Rs.of(context);
    showDialog(
      context: context,
      barrierDismissible: !isMandatory,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(rs.r(20)),
        ),
        backgroundColor: AppPalette.of(context).surface,
        title: Row(
          children: [
            Icon(
              Icons.privacy_tip_outlined,
              color: AppPalette.of(context).color(0xFF284E3A),
            ),
            SizedBox(width: rs.w(8)),
            Expanded(
              child: Text(
                'Data Privacy Notice',
                style: TextStyle(
                  fontSize: rs.sp(16),
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Republic Act No. 10173 (Data Privacy Act of 2012)',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                  color: AppPalette.of(context).color(0xFF284E3A),
                ),
              ),
              const SizedBox(height: 10),
              Text(
                'Pangasinan State University Infirmary collects and processes your Protected Health Information (PHI) '
                'for clinical consultation, emergency dispatch, and digital certification.\n\n'
                '• All clinical data is encrypted with AES-256-GCM.\n'
                '• Stored under statutory 5-year retention lifecycle.\n'
                '• Access monitored with immutable SHA-256 hash chains.',
                style: TextStyle(
                  fontSize: 13.5,
                  height: 1.5,
                  color: AppPalette.of(context).color(0xFF5A635B),
                ),
              ),
            ],
          ),
        ),
        actions: [
          if (isMandatory)
            TextButton(
              onPressed: _signOut,
              child: const Text(
                'Decline (Exit)',
                style: TextStyle(color: Colors.red),
              ),
            )
          else
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Close'),
            ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppPalette.of(context).background(0xFF284E3A),
              foregroundColor: AppPalette.of(context).onPrimary,
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
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(rs.r(20)),
        ),
        backgroundColor: AppPalette.of(context).surface,
        title: Text(
          'Revoke Consent?',
          style: TextStyle(
            fontWeight: FontWeight.w800,
            color: AppPalette.of(context).color(0xFF7A2E26),
            fontSize: rs.sp(16),
          ),
        ),
        content: Text(
          'Under R.A. 10173, revoking consent will suspend your access to digital health passes, prescriptions, and online scheduling.',
          style: TextStyle(
            fontSize: rs.sp(13),
            color: AppPalette.of(context).color(0xFF5A635B),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppPalette.of(context).background(0xFF7A2E26),
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
    try {
      final token = await _storage.read(key: 'jwt_token');
      if (!mounted || token == null) return;
      _socket = io.io(
        ApiConfig.socketUrl,
        io.OptionBuilder()
            .setTransports(['websocket', 'polling'])
            .setAuth({'token': token})
            .enableForceNew()
            .enableAutoConnect()
            .build(),
      );
      void invalidateAppointments(dynamic _) {
        if (_data.isCurrent(_generation)) {
          _data.invalidateAppointments(notifyHistory: true);
        }
      }

      _socket?.on('appointment:booked', invalidateAppointments);
      _socket?.on('appointment:cancelled', invalidateAppointments);
      _socket?.on('appointment:status_changed', invalidateAppointments);
      _socket?.on('prescription:status_changed', (_) {
        if (_data.isCurrent(_generation)) {
          _data.invalidate('/api/documents/prescriptions/my', notify: true);
        }
      });
      _socket?.on('documents:updated', (event) {
        if (!_sessionCurrent || event is! Map) return;
        final kind = event['kind'];
        if (kind == 'prescriptions' || kind == 'clearances') {
          _data.invalidate('/api/documents/$kind/my', notify: true);
        }
      });
      _socket?.onConnect((_) => _fetchActiveQueueTicket(silent: true));
      _socket?.on('queue:updated', (_) {
        _fetchActiveQueueTicket(silent: true);
      });
    } catch (_) {}
  }

  Future<void> _fetchActiveQueueTicket({bool silent = false}) {
    if (!mounted ||
        !_foreground ||
        !ConnectivityService().isOnline ||
        !_data.isCurrent(_generation)) {
      return Future.value();
    }
    final running = _queueRequest;
    if (running != null) {
      _queueRefreshQueued = true;
      return running;
    }
    return _queueRequest = _refreshQueue().whenComplete(
      () => _queueRequest = null,
    );
  }

  Future<void> _refreshQueue() async {
    do {
      _queueRefreshQueued = false;
      try {
        final token = await _storage.read(key: 'jwt_token');
        if (!mounted ||
            !_data.isCurrent(_generation) ||
            !_foreground ||
            !ConnectivityService().isOnline) {
          return;
        }
        final res = await _client
            .get(
              Uri.parse('${ApiConfig.baseUrl}/api/appointments/queue/my'),
              headers: {'Authorization': 'Bearer $token'},
            )
            .timeout(const Duration(seconds: 10));
        if (!mounted ||
            !_data.isCurrent(_generation) ||
            res.statusCode != 200) {
          return;
        }
        final data = jsonDecode(res.body);
        final ticket = data['hasActiveTicket'] == true
            ? data['ticket'] as Map<String, dynamic>?
            : null;
        final newStatus = ticket?['status'] ?? '';
        if (newStatus == 'in-consultation' &&
            _previousQueueStatus == 'waiting') {
          EmergencyAlertService().showQueueTurnNotification(
            ticketNo: ticket?['ticket_no'] ?? 'Your Ticket',
            doctorName: ticket?['doctor_name'] ?? 'Attending Doctor',
          );
        }
        _previousQueueStatus = newStatus;
        if (jsonEncode(ticket) != jsonEncode(_activeQueueTicket)) {
          setState(() => _activeQueueTicket = ticket);
        }
      } catch (_) {}
    } while (_queueRefreshQueued &&
        mounted &&
        _foreground &&
        ConnectivityService().isOnline &&
        _data.isCurrent(_generation));
  }

  bool get _hasValidPass =>
      _qrToken.isNotEmpty && (_qrExpiresAt?.isAfter(DateTime.now()) ?? false);

  void _selectTab(int index) {
    setState(() => _currentIndex = index);
    _refreshPassIfNeeded();
  }

  void _refreshPassIfNeeded() {
    if (_sessionCurrent &&
        _foreground &&
        _currentIndex == 0 &&
        _hasConsented &&
        !_hasValidPass &&
        ConnectivityService().isOnline) {
      unawaited(_fetchQRPass());
    }
  }

  Future<void> _fetchQRPass() async {
    if (!_sessionCurrent || _loadingQR) return;
    setState(() => _loadingQR = true);
    try {
      final token = await _storage.read(key: 'jwt_token');
      if (!mounted || token == null) return;
      final requestedAt = DateTime.now();
      final res = await _client
          .get(
            Uri.parse('${ApiConfig.baseUrl}/api/health-pass/token'),
            headers: {'Authorization': 'Bearer $token'},
          )
          .timeout(const Duration(seconds: 10));
      if (_sessionCurrent && res.statusCode == 200) {
        final pass = jsonDecode(res.body) as Map<String, dynamic>;
        final token = pass['qrToken'];
        final lifetime = pass['expiresInSeconds'];
        if (token is! String ||
            token.isEmpty ||
            lifetime is! int ||
            lifetime < 1) {
          return;
        }
        final expiresAt = requestedAt.add(Duration(seconds: lifetime));
        _qrTimer?.cancel();
        if (!expiresAt.isAfter(DateTime.now())) return;
        setState(() {
          _qrToken = token;
          _qrExpiresAt = expiresAt;
        });
        _qrTimer = Timer(expiresAt.difference(DateTime.now()), () {
          if (!_sessionCurrent) return;
          setState(() => _qrToken = '');
          _refreshPassIfNeeded();
        });
      }
    } catch (_) {
      // An existing pass can still be displayed until its expiry.
    } finally {
      if (mounted) setState(() => _loadingQR = false);
    }
  }

  Future<void> _fetchProfile() async {
    setState(() => _loadingProfile = true);
    try {
      final token = await _storage.read(key: 'jwt_token');
      if (!mounted || token == null) return;
      final res = await _client
          .get(
            Uri.parse('${ApiConfig.baseUrl}/api/profile/me'),
            headers: {'Authorization': 'Bearer $token'},
          )
          .timeout(const Duration(seconds: 10));
      if (mounted && _data.isCurrent(_generation) && res.statusCode == 200) {
        final decoded = jsonDecode(res.body) as Map<String, dynamic>;
        setState(() => _profileData = decoded);
        await _cacheEmergencyInfo(decoded);
      }
    } catch (_) {
      // Keep the last displayed profile when the refresh fails.
    } finally {
      if (mounted) setState(() => _loadingProfile = false);
    }
  }

  Future<void> _cacheEmergencyInfo(Map<String, dynamic> profile) async {
    final account = _account;
    if (!_sessionCurrent || account == null) return;
    try {
      final hp = profile['healthProfile'];
      await OfflineSosService().cacheEmergencyInfo(
        account,
        name: hp is Map ? hp['emergency_contact_name']?.toString() : null,
        phone: hp is Map ? hp['emergency_contact_phone']?.toString() : null,
      );
      _emergencyInfo = null;
      if (mounted) setState(() {});
    } catch (_) {}
  }

  // ===========================================================================
  // SOS
  // ===========================================================================

  Future<void> _launchDialer(String number) async {
    if (!await OfflineSosService().dialNumber(number) && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Could not open the dialer. Call $number from your phone.',
          ),
        ),
      );
    }
  }

  void _startHold() {
    if (_isDispatchingSOS) return;
    if (!_sosConsent) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text(
            'Please check the consent box before triggering SOS.',
          ),
          backgroundColor: AppPalette.of(context).background(0xFF7A2E26),
        ),
      );
      return;
    }

    _isHolding = true;
    _holdProgressNotifier.value = 0.0;
    setState(() => _sosStatusMessage = 'Keep holding to send SOS.');

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
    final account = _account;
    if (!_sessionCurrent || account == null) return;
    setState(() {
      _isDispatchingSOS = true;
      _sosStatusMessage = 'Acquiring GPS location...';
    });

    try {
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (!_sessionCurrent || _signOutInProgress) return;
      if (permission != LocationPermission.whileInUse &&
          permission != LocationPermission.always) {
        setState(() {
          _sosStatusMessage = 'Location access denied. Use the call buttons to contact help now.';
        });
        return;
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );
      if (!_sessionCurrent || _signOutInProgress) return;
      await OfflineSosService().queueSos(
        account,
        latitude: position.latitude,
        longitude: position.longitude,
      );
      if (!_sessionCurrent) return;
      setState(
        () => _sosStatusMessage =
            'SOS queued. Use the call buttons if you need help now.',
      );
      await _replayQueuedSosEvents();
    } catch (_) {
      if (_sessionCurrent) {
        setState(
          () => _sosStatusMessage = 'Could not prepare the SOS alert. Use the call buttons to contact help now.',
        );
      }
    } finally {
      if (mounted) setState(() => _isDispatchingSOS = false);
    }
  }

  bool _signOutInProgress = false;

  Future<void> _handleSignOut() async {
    if (_signOutInProgress) return;
    _signOutInProgress = true;
    try {
      if (!await confirmSignOut(context) || !mounted) return;
      await _signOut();
    } finally {
      _signOutInProgress = false;
    }
  }

  Future<void> _signOut() async {
    final token = await _storage.read(key: 'jwt_token');
    await EmergencyAlertService().signOut(token);
    if (mounted) AccountThemeScope.of(context).reset();
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
      if (diff.inDays < 365) {
        return '${(diff.inDays / 30).floor()}mo ago ($dateStr)';
      }
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
    final primaryGreen = AppPalette.of(context).color(0xFF284E3A);
    final firstName = widget.user['first_name'] ?? 'User';
    final lastName = widget.user['last_name'] ?? '';
    final tab = switch (_currentIndex) {
      1 => const ConsultationSchedulerScreen(),
      2 => _buildSOSTab(),
      3 => const DocumentsViewerScreen(),
      4 => _buildProfileTab(_getInitials(firstName, lastName)),
      _ => _buildOverviewTab(firstName),
    };

    return SessionTimeoutListener(
      timeoutMinutes: 480,
      child: Scaffold(
        backgroundColor: AppPalette.of(context).background(0xFFF7F9F6),
        appBar: PreferredSize(
          preferredSize: Size.fromHeight(rs.h(64).clamp(64.0, 72.0)),
          child: SafeArea(
            child: Padding(
              padding: EdgeInsets.symmetric(
                horizontal: rs.w(20),
                vertical: rs.h(8),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Flexible(
                    child: Row(
                      children: [
                        ValetudoLogo(size: rs.w(34).clamp(28.0, 42.0)),
                        SizedBox(width: rs.w(8)),
                        Flexible(
                          child: Text(
                            'LeoVital',
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: rs.sp(18),
                              fontWeight: FontWeight.w900,
                              color: AppPalette.of(context).color(0xFF191C1A),
                              letterSpacing: -0.5,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Row(
                    children: [
                      Container(
                        width: rs.w(36).clamp(32.0, 42.0),
                        height: rs.w(36).clamp(32.0, 42.0),
                        decoration: BoxDecoration(
                          color: AppPalette.of(context).color(0xFFE5EDE4),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          Icons.notifications_none_rounded,
                          size: rs.w(20),
                          color: primaryGreen,
                        ),
                      ),
                      SizedBox(width: rs.w(8)),
                      const AccountSettingsButton(),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
        body: Column(
          children: [
            const ActiveIncidentBanner(),
            if (!ConnectivityService().isOnline) _buildOfflineBanner(rs),
            Expanded(
              child: PageStorage(bucket: _data.bucket, child: tab),
            ),
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
      decoration: BoxDecoration(
        color: AppPalette.of(context).color(0xFFFDE8E8),
        border: Border(
          bottom: BorderSide(
            color: AppPalette.of(context).color(0xFFF8B4B4),
            width: 1,
          ),
        ),
      ),
      child: Row(
        children: [
          Icon(
            Icons.wifi_off_rounded,
            size: 16,
            color: AppPalette.of(context).color(0xFF7A2E26),
          ),
          SizedBox(width: rs.w(8)),
          Expanded(
            child: Text(
              'Offline · Last synced data shown. SOS still works via call.',
              style: TextStyle(
                fontSize: rs.sp(12),
                fontWeight: FontWeight.w600,
                color: AppPalette.of(context).color(0xFF7A2E26),
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
      decoration: BoxDecoration(
        color: AppPalette.of(context).color(0xFFF7F9F6),
        border: Border(
          top: BorderSide(
            color: AppPalette.of(context).color(0xFFE5EDE4),
            width: 1.0,
          ),
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
    final primaryGreen = AppPalette.of(context).color(0xFF284E3A);
    final softSagePill = AppPalette.of(context).color(0xFFE2EBE1);
    final textSub = AppPalette.of(context).color(0xFF5A635B);

    final pillWidth = rs.w(52).clamp(40.0, 56.0);
    final pillHeight = rs.h(30).clamp(24.0, 34.0);

    return InkWell(
      onTap: () => _selectTab(index),
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
    final sosActiveRed = AppPalette.of(context).color(0xFFA03B30);
    final sosInactivePeach = AppPalette.of(context).color(0xFFF6E2DB);

    final pillWidth = rs.w(52).clamp(40.0, 56.0);
    final pillHeight = rs.h(30).clamp(24.0, 34.0);

    return InkWell(
      onTap: () => _selectTab(index),
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

  Widget _qualifiedResponderBadge({
    required double top,
    required Widget child,
  }) {
    final roster = EmergencyAlertService().roster;
    return ListenableBuilder(
      listenable: roster,
      child: Padding(
        padding: EdgeInsets.only(top: top),
        child: child,
      ),
      builder: (context, badge) =>
          roster.qualified ? badge! : const SizedBox.shrink(),
    );
  }

  Widget _buildOverviewTab(String firstName) {
    final rs = Rs.of(context);
    final primaryGreen = AppPalette.of(context).color(0xFF284E3A);
    final textSub = AppPalette.of(context).color(0xFF5A635B);

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
            await Future.wait([
              _fetchQRPass(),
              _fetchProfile(),
              _fetchActiveQueueTicket(),
            ]);
          },
          child: ListView(
            key: const PageStorageKey('overview'),
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
                  color: AppPalette.of(context).color(0xFF191C1A),
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
                  color: AppPalette.of(context).color(0xFFE2EBE1),
                  borderRadius: BorderRadius.circular(rs.r(24)),
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Icon(
                              Icons.qr_code_2_rounded,
                              size: rs.w(20),
                              color: primaryGreen,
                            ),
                            SizedBox(width: rs.w(8)),
                            Text(
                              'Campus health pass',
                              style: TextStyle(
                                fontSize: rs.sp(14),
                                fontWeight: FontWeight.w700,
                                color: AppPalette.of(context).color(0xFF191C1A),
                              ),
                            ),
                          ],
                        ),
                        Icon(
                          Icons.verified_outlined,
                          size: rs.w(18),
                          color: primaryGreen,
                        ),
                      ],
                    ),
                    SizedBox(height: rs.h(18)),

                    Container(
                      padding: EdgeInsets.all(rs.w(16)),
                      decoration: BoxDecoration(
                        color: AppPalette.of(context).surface,
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
                              child: Center(
                                child: CircularProgressIndicator(
                                  color: primaryGreen,
                                  strokeWidth: 2,
                                ),
                              ),
                            )
                          : _hasValidPass
                          ? RepaintBoundary(
                              child: QrImageView(
                                data: _qrToken,
                                version: QrVersions.auto,
                                size: qrSize,
                                backgroundColor: Colors.white,
                              ),
                            )
                          : SizedBox(
                              height: qrSize,
                              width: qrSize,
                              child: Center(
                                child: TextButton(
                                  onPressed: _fetchQRPass,
                                  child: const Text('Refresh pass'),
                                ),
                              ),
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
                        color: AppPalette.of(context).color(0xFF191C1A),
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

                    _qualifiedResponderBadge(
                      top: rs.h(12),
                      child: Container(
                        padding: EdgeInsets.symmetric(
                          horizontal: rs.w(12),
                          vertical: rs.h(8),
                        ),
                        decoration: BoxDecoration(
                          color: AppPalette.of(context).color(0xFFF2F7F1),
                          border: Border.all(
                            color: AppPalette.of(context).color(0xFFDCE8DB),
                          ),
                          borderRadius: BorderRadius.circular(rs.r(999)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.health_and_safety_rounded,
                              size: rs.w(16),
                              color: primaryGreen,
                            ),
                            SizedBox(width: rs.w(6)),
                            Text(
                              'Qualified Responder',
                              style: TextStyle(
                                fontSize: rs.sp(11.5),
                                fontWeight: FontWeight.w700,
                                color: primaryGreen,
                              ),
                            ),
                            SizedBox(width: rs.w(6)),
                            Icon(
                              Icons.verified_rounded,
                              size: rs.w(15),
                              color: primaryGreen,
                            ),
                          ],
                        ),
                      ),
                    ),
                    const ResponderHubButton(),
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
                                    side: BorderSide(color: primaryGreen),
                                    shape: const StadiumBorder(),
                                    padding: EdgeInsets.symmetric(
                                      vertical: rs.h(10),
                                    ),
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
                                      const Icon(
                                        Icons.north_east_rounded,
                                        size: 14,
                                      ),
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
                                    foregroundColor: AppPalette.of(context)
                                        .onPrimary,
                                    elevation: 0,
                                    shape: const StadiumBorder(),
                                    padding: EdgeInsets.symmetric(
                                      vertical: rs.h(12),
                                    ),
                                  ),
                                  onPressed: () =>
                                      setState(() => _currentIndex = 1),
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
                                      const Icon(
                                        Icons.arrow_forward_rounded,
                                        size: 14,
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          )
                        : OverflowBar(
                            alignment: MainAxisAlignment.spaceBetween,
                            overflowAlignment: OverflowBarAlignment.center,
                            spacing: rs.w(8),
                            overflowSpacing: rs.h(8),
                            children: [
                              TextButton(
                                onPressed: () => _fetchQRPass(),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
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
                                    Icon(
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
                                  foregroundColor: AppPalette.of(context)
                                      .onPrimary,
                                  elevation: 0,
                                  shape: const StadiumBorder(),
                                  padding: EdgeInsets.symmetric(
                                    horizontal: rs.w(16),
                                    vertical: rs.h(10),
                                  ),
                                ),
                                onPressed: () =>
                                    setState(() => _currentIndex = 1),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      'Book consultation',
                                      style: TextStyle(
                                        fontSize: rs.sp(13),
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    SizedBox(width: rs.w(4)),
                                    const Icon(
                                      Icons.arrow_forward_rounded,
                                      size: 14,
                                    ),
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
                  color: AppPalette.of(context).color(0xFF191C1A),
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
                          color: AppPalette.of(context).color(0xFFEDEBF7),
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
                                  color: AppPalette.of(context)
                                      .color(0xFF5B4EA1),
                                ),
                                Icon(
                                  Icons.north_east_rounded,
                                  size: 16,
                                  color: AppPalette.of(context)
                                      .color(0xFF5B4EA1),
                                ),
                              ],
                            ),
                            SizedBox(height: rs.h(14)),
                            Text(
                              'Prescriptions',
                              style: TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: rs.sp(14),
                                color: AppPalette.of(context).color(0xFF261D52),
                              ),
                            ),
                            SizedBox(height: rs.h(4)),
                            Text(
                              'Your medication, made clear.',
                              style: TextStyle(
                                fontSize: rs.sp(11.5),
                                color: AppPalette.of(context).color(0xFF5A5285),
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
                          color: AppPalette.of(context).color(0xFFF7F1E6),
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
                                  color: AppPalette.of(context)
                                      .color(0xFF8C6826),
                                ),
                                Icon(
                                  Icons.north_east_rounded,
                                  size: 16,
                                  color: AppPalette.of(context)
                                      .color(0xFF8C6826),
                                ),
                              ],
                            ),
                            SizedBox(height: rs.h(14)),
                            Text(
                              'Medical clearances',
                              style: TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: rs.sp(14),
                                color: AppPalette.of(context).color(0xFF422F0A),
                              ),
                            ),
                            SizedBox(height: rs.h(4)),
                            Text(
                              'Ready for your next step.',
                              style: TextStyle(
                                fontSize: rs.sp(11.5),
                                color: AppPalette.of(context).color(0xFF6B5731),
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
                  color: AppPalette.of(context).color(0xFF244333),
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
                            Icon(
                              Icons.favorite_border_rounded,
                              size: 16,
                              color: Colors.white,
                            ),
                            SizedBox(width: rs.w(8)),
                            Text(
                              'YOUR HEALTH AT A GLANCE',
                              style: TextStyle(
                                fontSize: rs.sp(10),
                                letterSpacing: 1.8,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                              ),
                            ),
                          ],
                        ),
                        IconButton(
                          icon: const Icon(
                            Icons.more_horiz,
                            color: Colors.white,
                          ),
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(),
                          onPressed: () => setState(() => _currentIndex = 4),
                        ),
                      ],
                    ),
                    Row(
                      children: [
                        Container(
                          width: rs.w(44),
                          height: rs.w(44),
                          decoration: BoxDecoration(
                            color: AppPalette.of(context).surface
                                .withValues(alpha: 0.15),
                            shape: BoxShape.circle,
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            _getInitials(
                              u['first_name'] ?? 'P',
                              u['last_name'] ?? 'S',
                            ),
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
                  color: AppPalette.of(context).surface,
                  borderRadius: BorderRadius.circular(rs.r(20)),
                  border: Border.all(
                    color: AppPalette.of(context).color(0xFFE2EBE2),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.circle, size: 8, color: primaryGreen),
                        SizedBox(width: rs.w(8)),
                        Text(
                          'Your campus infirmary',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: rs.sp(13),
                            color: AppPalette.of(context).color(0xFF191C1A),
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: rs.h(12)),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.location_on_outlined,
                          size: rs.w(16),
                          color: textSub,
                        ),
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
                        Icon(
                          Icons.access_time_rounded,
                          size: rs.w(16),
                          color: textSub,
                        ),
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
                  color: AppPalette.of(context).surface,
                  borderRadius: BorderRadius.circular(rs.r(20)),
                  border: Border.all(
                    color: AppPalette.of(context).color(0xFFE2EBE2),
                  ),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.eco_outlined,
                      size: rs.w(20),
                      color: primaryGreen,
                    ),
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
                              color: AppPalette.of(context).color(0xFF191C1A),
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
        color: isServing
            ? AppPalette.of(context).color(0xFFFEF3C7)
            : AppPalette.of(context).color(0xFFE5EDE4),
        borderRadius: BorderRadius.circular(rs.r(22)),
        border: Border.all(
          color: isServing
              ? Colors.amber.shade700
              : AppPalette.of(context).color(0xFF284E3A),
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
                  isServing
                      ? 'NOW SERVING YOUR TICKET!'
                      : 'ACTIVE CLINIC QUEUE',
                  style: TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: rs.sp(11),
                    letterSpacing: 1.5,
                    color: isServing
                        ? Colors.amber.shade900
                        : AppPalette.of(context).color(0xFF284E3A),
                  ),
                ),
              ),
              Container(
                padding: EdgeInsets.symmetric(
                  horizontal: rs.w(10),
                  vertical: rs.h(4),
                ),
                decoration: BoxDecoration(
                  color: isServing
                      ? Colors.amber.shade800
                      : AppPalette.of(context).color(0xFF284E3A),
                  borderRadius: BorderRadius.circular(rs.r(16)),
                ),
                child: Text(
                  isServing ? 'YOUR TURN' : 'WAITING',
                  style: TextStyle(
                    color: isServing
                        ? Colors.white
                        : AppPalette.of(context).onPrimary,
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
                  color: isServing
                      ? Colors.amber.shade900
                      : AppPalette.of(context).color(0xFF284E3A),
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    isServing ? 'Proceed To' : 'Patients Ahead',
                    style: TextStyle(
                      fontSize: rs.sp(11),
                      color: AppPalette.of(context).color(0xFF5A635B),
                    ),
                  ),
                  Text(
                    isServing
                        ? (ticket['clinic_room'] ?? 'Clinic Room 1')
                        : '$patientsAhead',
                    style: TextStyle(
                      fontSize: rs.sp(isServing ? 14 : 20),
                      fontWeight: FontWeight.bold,
                      color: AppPalette.of(context).color(0xFF191C1A),
                    ),
                  ),
                ],
              ),
            ],
          ),
          SizedBox(height: rs.h(6)),
          Text(
            'Practitioner: ${ticket['doctor_name']} • Est: ~${waitMins > 0 ? waitMins : 5} mins',
            style: TextStyle(
              fontSize: rs.sp(12),
              color: AppPalette.of(context).color(0xFF5A635B),
            ),
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
    final textSub = AppPalette.of(context).color(0xFF5A635B);
    final textMain = AppPalette.of(context).color(0xFF191C1A);
    final primaryGreen = AppPalette.of(context).color(0xFF284E3A);

    final peachCardBg = AppPalette.of(context).color(0xFFF9EDE5);
    final demoBadgeBg = AppPalette.of(context).color(0xFFF2D9CE);
    final demoBadgeText = AppPalette.of(context).color(0xFF8D3F33);
    final sirenCircleBg = AppPalette.of(context).color(0xFFF1D8CC);
    final activeCrimson = AppPalette.of(context).background(0xFFA03B30);
    final activeHalo = AppPalette.of(context).color(0xFFF4C8C1);
    final inactiveCircle = AppPalette.of(context).color(0xFFBFA298);
    final inactiveHalo = AppPalette.of(context).color(0xFFE8D8CF);

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
            key: const PageStorageKey('sos'),
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

                Container(
                  margin: EdgeInsets.only(bottom: rs.h(16)),
                  padding: EdgeInsets.all(rs.w(16)),
                  decoration: BoxDecoration(
                    color: AppPalette.of(context).color(0xFFFDE8E8),
                    border: Border.all(
                      color: AppPalette.of(context).color(0xFFF8B4B4),
                    ),
                    borderRadius: BorderRadius.circular(rs.r(16)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(
                            Icons.wifi_off_rounded,
                            color: AppPalette.of(context).color(0xFF7A2E26),
                            size: rs.w(20),
                          ),
                          SizedBox(width: rs.w(8)),
                          Expanded(
                            child: Text(
                              isOffline
                                  ? 'You are currently offline'
                                  : 'Emergency calls',
                              style: TextStyle(
                                fontSize: rs.sp(14),
                                fontWeight: FontWeight.w800,
                                color: AppPalette.of(context).color(0xFF7A2E26),
                              ),
                            ),
                          ),
                        ],
                      ),
                      SizedBox(height: rs.h(8)),
                      Text(
                        "Use these buttons to contact help directly. Calls and texts depend on your phone service.",
                        style: TextStyle(
                          fontSize: rs.sp(12.5),
                          color: AppPalette.of(context).color(0xFF7A2E26),
                          height: 1.4,
                        ),
                      ),
                      SizedBox(height: rs.h(14)),
                      _buildOfflineCallButton(rs, '📞  Call 911', '911'),
                      SizedBox(height: rs.h(8)),
                      FutureBuilder<Map<String, dynamic>?>(
                        future: _emergencyInfo ??= OfflineSosService()
                            .readCachedEmergencyInfo(_account),
                        builder: (ctx, snap) {
                          final info = snap.data;
                          final name =
                              info?['contact_name'] ?? 'Emergency contact';
                          final phone = info?['contact_phone'];
                          if (phone == null) return const SizedBox.shrink();
                          return Column(
                            children: [
                              _buildOfflineCallButton(
                                rs,
                                '📞  Call $name',
                                phone,
                              ),
                              SizedBox(height: rs.h(8)),
                              _buildOfflineSmsButton(
                                rs,
                                name,
                                phone,
                                'EMERGENCY: I need help. This is an automated alert from LeoVital HealthLink.',
                              ),
                            ],
                          );
                        },
                      ),
                    ],
                  ),
                ),

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
                          'IN CASE OF EMERGENCY ONLY',
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
                            decoration: BoxDecoration(
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
                                      : AppPalette.of(context)
                                            .color(0xFFC7AAA0),
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
                        child: Container(
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
                              SizedBox(
                                width: progressSize,
                                height: progressSize,
                                child: RepaintBoundary(
                                  child: ValueListenableBuilder<double>(
                                    valueListenable: _holdProgressNotifier,
                                    builder: (context, progress, _) {
                                      if (progress == 0) {
                                        return const SizedBox.shrink();
                                      }
                                      return CircularProgressIndicator(
                                        value: progress,
                                        strokeWidth: 5,
                                        valueColor:
                                            const AlwaysStoppedAnimation<Color>(
                                              Colors.white,
                                            ),
                                        backgroundColor: Colors.transparent,
                                      );
                                    },
                                  ),
                                ),
                              ),
                              Container(
                                width: innerSize,
                                height: innerSize,
                                decoration: BoxDecoration(
                                  color: _sosConsent
                                      ? activeCrimson
                                      : inactiveCircle,
                                  shape: BoxShape.circle,
                                  boxShadow: _isHolding
                                      ? [
                                          BoxShadow(
                                            color: activeCrimson.withValues(
                                              alpha: 0.45,
                                            ),
                                            blurRadius: 20,
                                            spreadRadius: 4,
                                          ),
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
                                    DefaultTextStyle(
                                      style: TextStyle(
                                        fontSize: rs.sp(11),
                                        fontWeight: FontWeight.w500,
                                        color: Colors.white.withValues(
                                          alpha: 0.85,
                                        ),
                                      ),
                                      child: _isHolding
                                          ? ValueListenableBuilder<double>(
                                              valueListenable:
                                                  _holdProgressNotifier,
                                              builder: (context, progress, _) =>
                                                  Text(
                                                    '${((1.0 - progress) * 2.5).toStringAsFixed(1)}s remaining',
                                                  ),
                                            )
                                          : const Text('for 2.5 seconds'),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      SizedBox(height: rs.h(18)),

                      Text(
                        _sosStatusMessage.isNotEmpty ? _sosStatusMessage : 'Hold to send your current location to campus responders.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: rs.sp(12),
                          fontWeight: _sosStatusMessage.isNotEmpty
                              ? FontWeight.w700
                              : FontWeight.w500,
                          color:
                              _sosStatusMessage.startsWith(
                                'Campus server accepted',
                              )
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
          backgroundColor: AppPalette.of(context).background(0xFF7A2E26),
          foregroundColor: Colors.white,
          shape: const StadiumBorder(),
          elevation: 0,
        ),
        onPressed: () => _launchDialer(number),
        child: Text(
          label,
          style: TextStyle(fontSize: rs.sp(14), fontWeight: FontWeight.w700),
        ),
      ),
    );
  }

  Widget _buildOfflineSmsButton(
    Rs rs,
    String recipientLabel,
    String phone,
    String body,
  ) {
    return SizedBox(
      width: double.infinity,
      height: rs.h(44).clamp(40.0, 50.0),
      child: OutlinedButton(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppPalette.of(context).color(0xFF7A2E26),
          side: BorderSide(color: AppPalette.of(context).color(0xFF7A2E26)),
          shape: const StadiumBorder(),
        ),
        onPressed: () =>
            OfflineSosService().composeEmergencySms(phone, body: body),
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
    final primaryGreen = AppPalette.of(context).color(0xFF284E3A);
    final softSage = AppPalette.of(context).color(0xFFE5EDE4);
    final textSub = AppPalette.of(context).color(0xFF5A635B);

    if (_loadingProfile && _profileData == null) {
      return Center(child: CircularProgressIndicator(color: primaryGreen));
    }

    final hp = _profileData?['healthProfile'] ?? {};
    final u = _profileData?['user'] ?? widget.user;
    final identity = _identity;
    final maxContentWidth = rs.isTablet ? 560.0 : double.infinity;
    final bmi = double.tryParse('${hp['bmi'] ?? ''}');
    final bmiCategory = hp['bmi_category']?.toString();

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
            key: const PageStorageKey('profile'),
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
                  color: AppPalette.of(context).color(0xFF191C1A),
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
                  color: AppPalette.of(context).surface,
                  borderRadius: BorderRadius.circular(rs.r(24)),
                  border: Border.all(
                    color: AppPalette.of(context).color(0xFFE2EBE2),
                  ),
                ),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Container(
                          width: rs.w(54).clamp(46.0, 60.0),
                          height: rs.w(54).clamp(46.0, 60.0),
                          decoration: BoxDecoration(
                            color: AppPalette.of(context).color(0xFFE6DDCF),
                            shape: BoxShape.circle,
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            initials,
                            style: TextStyle(
                              fontSize: rs.sp(18),
                              fontWeight: FontWeight.w800,
                              color: AppPalette.of(context).color(0xFF4A4133),
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
                                  color: AppPalette.of(context)
                                      .color(0xFF191C1A),
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
                    _qualifiedResponderBadge(
                      top: rs.h(14),
                      child: Container(
                        width: double.infinity,
                        padding: EdgeInsets.symmetric(
                          horizontal: rs.w(12),
                          vertical: rs.h(10),
                        ),
                        decoration: BoxDecoration(
                          color: AppPalette.of(context).color(0xFFF2F7F1),
                          border: Border.all(
                            color: AppPalette.of(context).color(0xFFDCE8DB),
                          ),
                          borderRadius: BorderRadius.circular(rs.r(14)),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: rs.w(34),
                              height: rs.w(34),
                              decoration: BoxDecoration(
                                color: softSage,
                                borderRadius: BorderRadius.circular(rs.r(11)),
                              ),
                              child: Icon(
                                Icons.health_and_safety_rounded,
                                size: rs.w(19),
                                color: primaryGreen,
                              ),
                            ),
                            SizedBox(width: rs.w(10)),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Qualified Responder',
                                    style: TextStyle(
                                      fontSize: rs.sp(13),
                                      fontWeight: FontWeight.w700,
                                      color: primaryGreen,
                                    ),
                                  ),
                                  SizedBox(height: rs.h(2)),
                                  Text(
                                    'Campus emergency support',
                                    style: TextStyle(
                                      fontSize: rs.sp(11.5),
                                      color: textSub,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Icon(
                              Icons.verified_rounded,
                              size: rs.w(18),
                              color: primaryGreen,
                            ),
                          ],
                        ),
                      ),
                    ),
                    const ResponderHubButton(),
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
                        onPressed: () => _selectTab(0),
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
                  color: AppPalette.of(context).surface,
                  borderRadius: BorderRadius.circular(rs.r(24)),
                  border: Border.all(
                    color: AppPalette.of(context).color(0xFFE2EBE2),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Clinical details',
                      style: TextStyle(
                        fontSize: rs.sp(16),
                        fontWeight: FontWeight.w800,
                        color: AppPalette.of(context).color(0xFF191C1A),
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
                                'Date of Birth / Age',
                                style: TextStyle(
                                  fontSize: rs.sp(11.5),
                                  color: textSub,
                                ),
                              ),
                              SizedBox(height: rs.h(4)),
                              Text(
                                hp['date_of_birth'] != null
                                    ? "${hp['date_of_birth'].toString().split('T')[0]}${hp['age'] != null ? ' (${hp['age']} yrs)' : ''}"
                                    : 'Not recorded',
                                style: TextStyle(
                                  fontSize: rs.sp(14),
                                  fontWeight: FontWeight.w600,
                                  color: AppPalette.of(context)
                                      .color(0xFF191C1A),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: rs.h(12)),
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Sex',
                                style: TextStyle(
                                  fontSize: rs.sp(11.5),
                                  color: textSub,
                                ),
                              ),
                              SizedBox(height: rs.h(4)),
                              Text(
                                hp['sex'] ?? 'Not recorded',
                                style: TextStyle(
                                  fontSize: rs.sp(14),
                                  fontWeight: FontWeight.w600,
                                  color: AppPalette.of(context)
                                      .color(0xFF191C1A),
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
                                'BMI',
                                style: TextStyle(
                                  fontSize: rs.sp(11.5),
                                  color: textSub,
                                ),
                              ),
                              SizedBox(height: rs.h(4)),
                              Text(
                                bmi != null && bmi > 0
                                    ? '${bmi.toStringAsFixed(1)}${bmiCategory == null ? '' : ' · $bmiCategory'}'
                                    : 'Not available',
                                style: TextStyle(
                                  fontSize: rs.sp(14),
                                  fontWeight: FontWeight.w600,
                                  color: AppPalette.of(context)
                                      .color(0xFF191C1A),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: rs.h(6)),
                    Text(
                      'Adult BMI ranges are the same for MALE and FEMALE.',
                      style: TextStyle(fontSize: rs.sp(11), color: textSub),
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
                                style: TextStyle(
                                  fontSize: rs.sp(11.5),
                                  color: textSub,
                                ),
                              ),
                              SizedBox(height: rs.h(4)),
                              Text(
                                hp['blood_type'] ?? '—',
                                style: TextStyle(
                                  fontSize: rs.sp(17),
                                  fontWeight: FontWeight.w800,
                                  color: AppPalette.of(context)
                                      .color(0xFF191C1A),
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
                                  fontSize: rs.sp(11.5),
                                  color: textSub,
                                ),
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
                                  color: AppPalette.of(context)
                                      .color(0xFF7A2E26),
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
                                style: TextStyle(
                                  fontSize: rs.sp(11.5),
                                  color: textSub,
                                ),
                              ),
                              SizedBox(height: rs.h(4)),
                              Text(
                                hp['chronic_conditions'] ?? 'None',
                                style: TextStyle(
                                  fontSize: rs.sp(14),
                                  fontWeight: FontWeight.w600,
                                  color: AppPalette.of(context)
                                      .color(0xFF191C1A),
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
                                style: TextStyle(
                                  fontSize: rs.sp(11.5),
                                  color: textSub,
                                ),
                              ),
                              SizedBox(height: rs.h(4)),
                              Text(
                                hp['height'] != null
                                    ? '${hp['height']} cm'
                                    : '—',
                                style: TextStyle(
                                  fontSize: rs.sp(14),
                                  fontWeight: FontWeight.w600,
                                  color: AppPalette.of(context)
                                      .color(0xFF191C1A),
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
                          style: TextStyle(
                            fontSize: rs.sp(11.5),
                            color: textSub,
                          ),
                        ),
                        SizedBox(height: rs.h(4)),
                        Text(
                          hp['weight'] != null ? '${hp['weight']} kg' : '—',
                          style: TextStyle(
                            fontSize: rs.sp(14),
                            fontWeight: FontWeight.w600,
                            color: AppPalette.of(context).color(0xFF191C1A),
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
                          Icon(
                            Icons.verified_outlined,
                            size: rs.w(16),
                            color: primaryGreen,
                          ),
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
                  color: AppPalette.of(context).surface,
                  borderRadius: BorderRadius.circular(rs.r(24)),
                  border: Border.all(
                    color: AppPalette.of(context).color(0xFFE2EBE2),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Immunizations',
                      style: TextStyle(
                        fontSize: rs.sp(16),
                        fontWeight: FontWeight.w800,
                        color: AppPalette.of(context).color(0xFF191C1A),
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
                                    color: AppPalette.of(context)
                                        .color(0xFF191C1A),
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
                  color: AppPalette.of(context).surface,
                  borderRadius: BorderRadius.circular(rs.r(24)),
                  border: Border.all(
                    color: AppPalette.of(context).color(0xFFE2EBE2),
                  ),
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
                            color: AppPalette.of(context).color(0xFF191C1A),
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
                        color: AppPalette.of(context).color(0xFF191C1A),
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
                        color: AppPalette.of(context).color(0xFF191C1A),
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
              Material(
                color: AppPalette.of(context).surface,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(rs.r(24)),
                  side: BorderSide(
                    color: AppPalette.of(context).color(0xFFE2EBE2),
                  ),
                ),
                clipBehavior: Clip.antiAlias,
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
                        MaterialPageRoute(
                          builder: (_) => const ChangePasswordScreen(),
                        ),
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
                              ? AppPalette.of(context).color(0xFF284E3A)
                              : AppPalette.of(context).color(0xFF7A2E26),
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
                                  color: AppPalette.of(context)
                                      .color(0xFF7A2E26),
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
