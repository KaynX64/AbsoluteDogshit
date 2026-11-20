// mobile/lib/services/emergency_alert_service.dart
import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import '../config/api_config.dart';
import 'responder_roster.dart';
import 'mobile_session_data.dart';

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

// Top-level function executed on a background isolate to avoid UI thread jank
Uint8List _generateWavBytesIsolate(int durationSeconds) {
  const int sampleRate = 22050;
  final int numSamples = durationSeconds * sampleRate;
  final int dataSize = numSamples * 2;
  final int fileSize = 36 + dataSize;
  final ByteData byteData = ByteData(44 + dataSize);

  // RIFF Header
  byteData.setUint8(0, 0x52);
  byteData.setUint8(1, 0x49);
  byteData.setUint8(2, 0x46);
  byteData.setUint8(3, 0x46);
  byteData.setUint32(4, fileSize, Endian.little);
  byteData.setUint8(8, 0x57);
  byteData.setUint8(9, 0x41);
  byteData.setUint8(10, 0x56);
  byteData.setUint8(11, 0x45);

  // fmt chunk
  byteData.setUint8(12, 0x66);
  byteData.setUint8(13, 0x6D);
  byteData.setUint8(14, 0x74);
  byteData.setUint8(15, 0x20);
  byteData.setUint32(16, 16, Endian.little);
  byteData.setUint16(20, 1, Endian.little);
  byteData.setUint16(22, 1, Endian.little);
  byteData.setUint32(24, sampleRate, Endian.little);
  byteData.setUint32(28, sampleRate * 2, Endian.little);
  byteData.setUint16(32, 2, Endian.little);
  byteData.setUint16(34, 16, Endian.little);

  // data chunk
  byteData.setUint8(36, 0x64);
  byteData.setUint8(37, 0x61);
  byteData.setUint8(38, 0x74);
  byteData.setUint8(39, 0x61);
  byteData.setUint32(40, dataSize, Endian.little);

  int offset = 44;
  const double f1 = 853.0;
  const double f2 = 960.0;
  const double twoPi = 2.0 * math.pi;

  for (int i = 0; i < numSamples; i++) {
    final double t = i / sampleRate;
    final double sampleValue =
        0.5 * (math.sin(twoPi * f1 * t) + math.sin(twoPi * f2 * t));
    final int sample16 = (sampleValue * 28000).toInt().clamp(-32768, 32767);
    byteData.setInt16(offset, sample16, Endian.little);
    offset += 2;
  }

  return byteData.buffer.asUint8List();
}

enum DeliveryStatus { pending, saved, failed }

class EmergencyAlertService {
  EmergencyAlertService._([this._client, this._connectRealtime = true]) {
    roster.addListener(_updateAlarm);
  }
  static final _instance = EmergencyAlertService._();
  factory EmergencyAlertService() => _instance;

  @visibleForTesting
  EmergencyAlertService.test(http.Client client) : this._(client, false);

  final http.Client? _client;
  final bool _connectRealtime;
  http.Client get _http => _client ?? ApiConfig.client;
  final roster = ResponderRoster();
  final delivery = ValueNotifier(DeliveryStatus.pending);
  final notificationOpen = ValueNotifier<int?>(null);
  final _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(storageNamespace: 'responder_device'),
  );
  final _notifications = FlutterLocalNotificationsPlugin();

  static const _installationKey = 'responder_installation_id';
  static const _modeKey = 'responder_duty_mode';
  static const _audibleChannel = 'responder_sos_audible_v1';
  static const _quietChannel = 'responder_sos_quiet_v1';
  static const _foregroundChannel = 'responder_sos_foreground_v1';
  static const _timeout = Duration(seconds: 5);

  String? _jwt;
  String? installationId;
  String? _fcmToken;
  int _session = 0;
  int _accessVersion = 0;
  bool _foreground = false;
  bool _terminating = false;
  bool _requestInitialized = false;
  io.Socket? _socket;
  int? _pendingOpen;
  Future<bool>? _accessRequest;
  Future<bool>? _refreshRequest;
  int _refreshVersion = 0;
  Future<bool>? _firebase;
  Future<bool>? _channels;
  Future<void>? _permission;
  Future<void>? _registration;
  Future<void> _modeWrites = Future.value();
  final _announced = <int>{};
  final _updating = <int>{};
  final _localPosts = <int>{};
  Future<void> _notificationQueue = Future.value();

  AudioPlayer? _player;
  Uint8List? _fallback;
  Future<void> _audioQueue = Future.value();
  bool _wantsAudio = false;
  bool _testing = false;
  Timer? _testTimer;
  int _audioVersion = 0;

  bool get _android =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  Map<String, String> _headers(String token) => {
    'Authorization': 'Bearer $token',
    'Content-Type': 'application/json',
  };
  Uri _url(String path) => Uri.parse(ApiConfig.baseUrl + path);
  bool _current(int session) => _jwt != null && session == _session;
  bool get _automatic => roster.mode != ResponderDutyMode.offDuty;

  void beginSession(String token, Object? userId) {
    endSession(preserveNotification: _jwt == null && !_terminating);
    _jwt = token;
    MobileSessionData.instance.begin(token);
    _terminating = false;
    roster.begin(Incident.readId(userId));
    final session = _session;
    unawaited(_startSession(session, token));
  }

  Future<void> _startSession(int session, String token) async {
    ResponderDutyMode mode = ResponderDutyMode.onDuty;
    String? id;
    if (_android) {
      try {
        await _modeWrites.catchError((Object _) {});
        final savedId = await _storage.read(key: _installationKey);
        final random = math.Random.secure();
        id =
            savedId ??
            List.generate(
              16,
              (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
            ).join();
        if (savedId == null) {
          await _storage.write(key: _installationKey, value: id);
        }
        mode = ResponderDutyMode.read(await _storage.read(key: _modeKey));
      } catch (_) {
        id = null;
      }
    }
    if (!_current(session)) return;
    installationId = id;
    roster.setMode(mode);
    _requestInitialized = true;
    if (_connectRealtime) _connect(token, session);
    unawaited(_syncRegistration());
    await refreshAccess();
    if (_current(session) && _automatic) unawaited(refreshIncidents());
    unawaited(_openPendingNotification());
  }

  void endSession({bool preserveNotification = false}) {
    MobileSessionData.instance.clear();
    _session++;
    _accessVersion++;
    _jwt = null;
    _requestInitialized = false;
    _socket?.dispose();
    _socket = null;
    _accessRequest = null;
    _refreshRequest = null;
    _registration = null;
    installationId = null;
    _announced.clear();
    _updating.clear();
    _cancelLocalNotifications();
    _testing = false;
    _testTimer?.cancel();
    // A cold-start tap can precede the first authenticated session.
    if (!preserveNotification) _pendingOpen = null;
    notificationOpen.value = null;
    roster.begin(null);
    delivery.value = DeliveryStatus.pending;
  }

  /// Stops token updates while the server removes this registration.
  Future<Map<String, String>> terminationDevice() async {
    _terminating = true;
    _pendingOpen = null;
    notificationOpen.value = null;
    _updateAlarm();
    String? id = installationId;
    if (id == null && _android) {
      try {
        id = await _storage.read(key: _installationKey).timeout(_timeout);
      } catch (_) {
        // Older registrations can still be removed by their FCM token.
      }
    }
    final registration = _registration;
    if (registration != null) await registration;
    final token =
        _fcmToken ??
        await currentFcmToken().timeout(
          const Duration(seconds: 2),
          onTimeout: () => null,
        );
    return {'installation_id': ?id, 'fcm_token': ?token};
  }

  void resumeRegistration() {
    _terminating = false;
    _updateAlarm();
    if (_requestInitialized) unawaited(_syncRegistration());
  }

  Future<void> signOut(String? token) async {
    try {
      if (token != null) {
        final device = await terminationDevice();
        await _http
            .post(
              _url('/api/auth/logout'),
              headers: _headers(token),
              body: jsonEncode(device),
            )
            .timeout(_timeout);
      }
    } catch (_) {
      debugPrint('Remote sign-out could not be confirmed.');
    } finally {
      _terminating = true;
      endSession();
    }
  }

  void setForeground(bool value) {
    _foreground = value;
    _updateAlarm();
    if (!value || !_requestInitialized) return;
    unawaited(recover());
  }

  Future<void> recover() async {
    if (!_requestInitialized) return;
    await refreshAccess();
    if (_automatic) await refreshIncidents();
    if (delivery.value != DeliveryStatus.saved) unawaited(_syncRegistration());
    await _openPendingNotification();
  }

  void _connect(String token, int session) {
    try {
      final socket = io.io(
        ApiConfig.socketUrl,
        io.OptionBuilder()
            .setTransports(['websocket', 'polling'])
            .setAuth({'token': token})
            .enableForceNew()
            .disableAutoConnect()
            .build(),
      );
      _socket = socket;
      socket.onConnect((_) {
        if (_current(session)) unawaited(recover());
      });
      socket.on('responder:status_changed', (_) {
        if (!_current(session)) return;
        _clearAccess();
        unawaited(recover());
      });
      socket.on('emergency:new_alert', (value) {
        if (!_current(session) || value is! Map || !_automatic) return;
        final incident = Incident.parse(value);
        if (incident != null) roster.accept(incident);
      });
      socket.on('emergency:status_change', (value) {
        if (!_current(session) || value is! Map) return;
        final id = Incident.readId(value['alertId']);
        final status = IncidentStatus.read(value['status']);
        if (id != null && status != null) {
          roster.statusChanged(id, status);
          if (status != IncidentStatus.triggered) _cancelLocalNotification(id);
        }
      });
      socket.connect();
    } catch (_) {
      debugPrint('Responder realtime connection could not start.');
    }
  }

  void _clearAccess() {
    _accessVersion++;
    _accessRequest = null;
    _announced.clear();
    _updating.clear();
    _pendingOpen = null;
    notificationOpen.value = null;
    _cancelLocalNotifications();
    _testing = false;
    _testTimer?.cancel();
    roster.setAccess(null, false);
  }

  Future<bool> refreshAccess() {
    final token = _jwt;
    if (token == null || !_requestInitialized) return Future.value(false);
    final running = _accessRequest;
    if (running != null) return running;
    final session = _session, access = _accessVersion;
    return _accessRequest = _loadAccess(token, session, access).whenComplete(
      () {
        if (_current(session) && access == _accessVersion) {
          _accessRequest = null;
        }
      },
    );
  }

  Future<bool> _loadAccess(String token, int session, int access) async {
    try {
      final response = await _http
          .get(
            _url('/api/emergency/responder-access'),
            headers: _headers(token),
          )
          .timeout(_timeout);
      if (!_current(session) || access != _accessVersion) return false;
      if (response.statusCode == 401 || response.statusCode == 403) {
        _clearAccess();
        return false;
      }
      if (response.statusCode != 200) return false;
      final result = jsonDecode(response.body);
      final tier = result['tier'];
      if (result['authorized'] != true ||
          (tier != 'community' && tier != 'clinical')) {
        _clearAccess();
        return false;
      }
      if (roster.eligible && tier != roster.tier) {
        // Invalidate any outstanding snapshot from the previous detail tier.
        _clearAccess();
      }
      roster.setAccess(tier as String, result['isQualifiedResponder'] == true);
      return true;
    } catch (error) {
      debugPrint('Unable to check responder access (${error.runtimeType}).');
      return false;
    }
  }

  Future<bool> refreshIncidents({bool manual = false}) {
    final token = _jwt;
    if (token == null || !roster.eligible || (!manual && !_automatic)) {
      return Future.value(false);
    }
    final running = _refreshRequest;
    if (running != null) {
      if (_refreshVersion == _accessVersion) return running;
      final session = _session;
      return running.then(
        (_) => _current(session) ? refreshIncidents(manual: manual) : false,
      );
    }
    final session = _session, access = _accessVersion;
    _refreshVersion = access;
    return _refreshRequest = _loadIncidents(token, session, access, manual)
        .whenComplete(() {
          if (_current(session)) _refreshRequest = null;
        });
  }

  Future<bool> _loadIncidents(
    String token,
    int session,
    int access,
    bool manual,
  ) async {
    final revision = roster.revision;
    roster.setLoading(true);
    var succeeded = false;
    try {
      final response = await _http
          .get(_url('/api/emergency/active'), headers: _headers(token))
          .timeout(_timeout);
      if (!_current(session) || access != _accessVersion) return false;
      if (response.statusCode == 401 || response.statusCode == 403) {
        _clearAccess();
      } else if (response.statusCode == 200 && (manual || _automatic)) {
        final body = jsonDecode(response.body) as List;
        roster.reconcile(
          body.whereType<Map>().map(Incident.parse).nonNulls,
          revision,
        );
        succeeded = true;
      }
      return succeeded;
    } catch (error) {
      debugPrint(
        'Could not refresh the incident roster (${error.runtimeType}).',
      );
      return false;
    } finally {
      if (_current(session) && access == _accessVersion) {
        roster.setLoading(false, error: !succeeded && (manual || _automatic));
      }
    }
  }

  Future<String?> updateStatus(int id, IncidentStatus status) async {
    final token = _jwt;
    final session = _session, access = _accessVersion;
    if (token == null || roster[id] == null) return 'Incident unavailable.';
    if (!_updating.add(id)) return 'An update is already in progress.';
    try {
      final response = await _http
          .patch(
            _url('/api/emergency/$id/status'),
            headers: _headers(token),
            body: jsonEncode({'status': status.code}),
          )
          .timeout(_timeout);
      if (!_current(session) || access != _accessVersion) {
        return 'Responder access changed.';
      }
      if (response.statusCode == 401 || response.statusCode == 403) {
        _clearAccess();
        return 'Responder access is unavailable.';
      }
      if (response.statusCode == 200) {
        roster.statusChanged(id, status);
        _cancelLocalNotification(id);
        return null;
      }
      if (response.statusCode == 409) {
        final current = IncidentStatus.read(
          jsonDecode(response.body)['currentStatus'],
        );
        if (current != null) {
          roster.statusChanged(id, current);
          _cancelLocalNotification(id);
          return current.isClosed || current == status
              ? null
              : 'The incident is already ${current.label.toLowerCase()}.';
        }
      }
      if (response.statusCode == 404) {
        roster.statusChanged(id, IncidentStatus.resolved);
        _cancelLocalNotification(id);
      }
      return 'The incident could not be updated.';
    } catch (_) {
      return 'Could not update the incident. Check your connection and try again.';
    } finally {
      if (_current(session) && access == _accessVersion) _updating.remove(id);
    }
  }

  Future<void> setDutyMode(ResponderDutyMode mode) async {
    if (!_android || !roster.eligible || _jwt == null || roster.mode == mode) {
      return;
    }
    if (mode == ResponderDutyMode.offDuty) {
      _testing = false;
      _testTimer?.cancel();
      _cancelLocalNotifications();
    }
    roster.setMode(mode);
    if (_automatic) unawaited(refreshIncidents());
    await retryDelivery();
  }

  Future<void> retryDelivery() async {
    if (_jwt == null) return;
    final session = _session;
    final mode = roster.mode;
    delivery.value = DeliveryStatus.pending;
    try {
      await (_modeWrites = _modeWrites.catchError((Object _) {}).then((
        _,
      ) async {
        if (_current(session)) {
          await _storage.write(key: _modeKey, value: mode.code);
        }
      }));
    } catch (_) {
      if (_current(session) && roster.mode == mode) {
        delivery.value = DeliveryStatus.failed;
      }
      return;
    }
    if (_current(session) && roster.mode == mode) await _syncRegistration();
  }

  Future<bool> initializeFirebase() => _firebase ??= _initializeFirebase();

  Future<bool> _initializeFirebase() async {
    if (!_android && (kIsWeb || defaultTargetPlatform != TargetPlatform.iOS)) {
      return false;
    }
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(
        _firebaseMessagingBackgroundHandler,
      );
      FirebaseMessaging.onMessage.listen(_onForegroundMessage);
      FirebaseMessaging.onMessageOpenedApp.listen(_onPushTap);
      FirebaseMessaging.instance.onTokenRefresh.listen((token) {
        _fcmToken = token;
        unawaited(_syncRegistration());
      });
      final initial = await FirebaseMessaging.instance.getInitialMessage();
      if (initial != null) _onPushTap(initial);
      return true;
    } catch (_) {
      debugPrint('Firebase messaging is unavailable.');
      return false;
    }
  }

  void _onForegroundMessage(RemoteMessage message) {
    if (_jwt == null || !_foreground || _terminating) return;
    final data = message.data;
    if (data['type'] == 'EMERGENCY_SOS') {
      final id = Incident.readId(data['alertId']);
      if (_automatic && id != null) unawaited(_refreshForPush(id));
    } else if (data['type'] == 'QUEUE_TURN') {
      unawaited(
        showQueueTurnNotification(
          ticketNo: data['ticketNo'] ?? data['ticket_no'] ?? 'Your Ticket',
          doctorName:
              data['doctorName'] ?? data['doctor_name'] ?? 'Attending Doctor',
        ),
      );
    } else {
      unawaited(
        showAppointmentConfirmedNotification(
          message.notification?.title,
          message.notification?.body,
        ),
      );
    }
  }

  Future<void> _refreshForPush(int id) async {
    final session = _session;
    if (!await refreshAccess() || !_current(session) || roster[id] != null) {
      return;
    }
    final running = _refreshRequest;
    if (running != null) await running;
    if (_current(session) && roster[id] == null) await refreshIncidents();
  }

  void _onPushTap(RemoteMessage message) {
    if (message.data['type'] == 'EMERGENCY_SOS') {
      handleNotificationTap(message.data['alertId']);
    }
  }

  void handleNotificationTap(Object? value) {
    final id = Incident.readId(value);
    if (id == null || _terminating) return;
    _pendingOpen = id;
    unawaited(_openPendingNotification());
  }

  bool _openingNotification = false;
  Future<void> _openPendingNotification() async {
    final id = _pendingOpen;
    if (id == null ||
        !_foreground ||
        !_requestInitialized ||
        _openingNotification) {
      return;
    }
    _openingNotification = true;
    final session = _session;
    _pendingOpen = null;
    try {
      final allowed = await refreshAccess();
      final loaded = allowed && await refreshIncidents(manual: true);
      if (!_current(session) || _terminating) return;
      if (!_foreground) {
        _pendingOpen ??= id;
        return;
      }
      notificationOpen.value = loaded && roster[id] != null ? id : -1;
    } finally {
      _openingNotification = false;
      if (_foreground && _pendingOpen != null) {
        unawaited(_openPendingNotification());
      }
    }
  }

  Future<String?> currentFcmToken() async {
    if (_fcmToken != null) return _fcmToken;
    try {
      if (!await initializeFirebase().timeout(_timeout)) return null;
      return _fcmToken ??= await FirebaseMessaging.instance.getToken().timeout(
        _timeout,
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> _syncRegistration() {
    final token = _jwt;
    if (token == null ||
        !_requestInitialized ||
        _terminating ||
        kIsWeb ||
        (!_android && defaultTargetPlatform != TargetPlatform.iOS)) {
      return Future.value();
    }
    final running = _registration;
    if (running != null) return running;
    final session = _session;
    return _registration = _register(token, session).whenComplete(() {
      if (_current(session)) _registration = null;
    });
  }

  Future<void> _register(String token, int session) async {
    delivery.value = DeliveryStatus.pending;
    try {
      if (_android && !await (_channels ??= _initializeNotifications())) {
        throw StateError('SOS channels unavailable');
      }
      if (!_android && await initializeFirebase()) {
        await FirebaseMessaging.instance.requestPermission().timeout(_timeout);
      }
      do {
        await _modeWrites;
        final fcmToken = await currentFcmToken();
        if (!_current(session) || _terminating) return;
        if (fcmToken == null || (_android && installationId == null)) {
          throw StateError('Push device unavailable');
        }
        final mode = roster.mode;
        final response = await _http
            .post(
              _url('/api/profile/fcm-token'),
              headers: _headers(token),
              body: jsonEncode({
                'fcm_token': fcmToken,
                'device_type': _android ? 'android' : 'ios',
                if (_android) 'installation_id': installationId,
                if (_android) 'sos_mode': mode.code,
              }),
            )
            .timeout(_timeout);
        if (!_current(session) || _terminating) return;
        if (response.statusCode != 200 ||
            (_android && jsonDecode(response.body)['sos_mode'] != mode.code)) {
          throw StateError('Push registration not confirmed');
        }
        if (roster.mode == mode && _fcmToken == fcmToken) {
          delivery.value = DeliveryStatus.saved;
          return;
        }
      } while (_current(session) && !_terminating);
    } catch (_) {
      if (_current(session)) delivery.value = DeliveryStatus.failed;
    }
  }

  Future<void> requestNotificationPermission() =>
      _permission ??= _requestNotificationPermission();

  Future<void> _requestNotificationPermission() async {
    if (!await (_channels ??= _initializeNotifications())) return;
    try {
      await _notifications
          .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin
          >()
          ?.requestNotificationsPermission();
    } catch (_) {
      debugPrint('Notification permission is unavailable.');
    }
  }

  Future<bool> _initializeNotifications() async {
    if (!_android) return false;
    try {
      await _notifications.initialize(
        const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        ),
        onDidReceiveNotificationResponse: (response) =>
            handleNotificationTap(response.payload),
      );
      final android = _notifications
          .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin
          >();
      if (android == null) return false;
      const channels = [
        AndroidNotificationChannel(
          _audibleChannel,
          'Campus SOS · On duty',
          importance: Importance.max,
          sound: RawResourceAndroidNotificationSound('emr_sound'),
        ),
        AndroidNotificationChannel(
          _quietChannel,
          'Campus SOS · Quiet',
          importance: Importance.high,
          playSound: false,
          enableVibration: true,
        ),
        AndroidNotificationChannel(
          _foregroundChannel,
          'Campus SOS · In app',
          importance: Importance.high,
          playSound: false,
          enableVibration: false,
        ),
        AndroidNotificationChannel(
          'student_sos_confirmation_channel',
          'SOS Dispatch Confirmation',
          importance: Importance.high,
        ),
        AndroidNotificationChannel(
          'clinic_queue_channel',
          'Clinic Queue Turn',
          importance: Importance.high,
        ),
        AndroidNotificationChannel(
          'appointment_channel',
          'Consultation Appointments',
          importance: Importance.high,
        ),
      ];
      await Future.wait(channels.map(android.createNotificationChannel));
      final launch = await _notifications.getNotificationAppLaunchDetails();
      if (launch?.didNotificationLaunchApp == true) {
        handleNotificationTap(launch?.notificationResponse?.payload);
      }
      return true;
    } catch (_) {
      debugPrint('Android notification channels are unavailable.');
      return false;
    }
  }

  Future<void> _showNotification(
    int id,
    String? title,
    String? body,
    NotificationDetails details,
  ) async {
    if (!await (_channels ??= _initializeNotifications())) return;
    try {
      await _notifications.show(id, title, body, details);
    } catch (_) {
      debugPrint('Local notification could not be shown.');
    }
  }

  void _announce(Incident incident) {
    final session = _session;
    _notificationQueue = _notificationQueue.then((_) async {
      if (!await (_channels ??= _initializeNotifications()) ||
          !_current(session) ||
          !_foreground ||
          !_automatic ||
          roster[incident.id]?.status != IncidentStatus.triggered ||
          _terminating) {
        return;
      }
      try {
        final quiet = roster.mode == ResponderDutyMode.quiet;
        await _notifications.show(
          999,
          'Campus emergency SOS',
          'Open LeoVital to view the incident.',
          NotificationDetails(
            android: AndroidNotificationDetails(
              quiet ? _quietChannel : _foregroundChannel,
              quiet ? 'Campus SOS · Quiet' : 'Campus SOS · In app',
              importance: Importance.high,
              priority: Priority.high,
              playSound: false,
              enableVibration: quiet,
              visibility: NotificationVisibility.private,
              tag: 'responder-sos-${incident.id}',
            ),
          ),
          payload: '${incident.id}',
        );
        _localPosts.add(incident.id);
      } catch (_) {
        debugPrint('SOS notification could not be shown.');
      }
    });
  }

  void _cancelLocalNotification(int id) {
    _notificationQueue = _notificationQueue.then((_) async {
      if (!_localPosts.remove(id)) return;
      try {
        await _notifications.cancel(999, tag: 'responder-sos-$id');
      } catch (_) {
        debugPrint('SOS notification could not be removed.');
      }
    });
  }

  void _cancelLocalNotifications() {
    _notificationQueue = _notificationQueue.then((_) async {
      for (final id in _localPosts.toList()) {
        try {
          await _notifications.cancel(999, tag: 'responder-sos-$id');
        } catch (_) {
          debugPrint('SOS notification could not be removed.');
        }
      }
      _localPosts.clear();
    });
  }

  void testSiren() {
    if (!_foreground ||
        !roster.eligible ||
        roster.incidents.any(
          (incident) => incident.status == IncidentStatus.triggered,
        )) {
      return;
    }
    _testing = true;
    _testTimer?.cancel();
    _testTimer = Timer(const Duration(seconds: 3), () {
      _testing = false;
      _updateAlarm();
    });
    _updateAlarm();
  }

  void _updateAlarm() {
    final triggered = roster.incidents.where(
      (incident) => incident.status == IncidentStatus.triggered,
    );
    final current = triggered.map((incident) => incident.id).toSet();
    for (final id
        in _localPosts.where((id) => !current.contains(id)).toList()) {
      _cancelLocalNotification(id);
    }
    if (triggered.isNotEmpty || !_foreground || !roster.eligible) {
      _testing = false;
      _testTimer?.cancel();
    }
    if (_foreground && _automatic && !_terminating) {
      for (final incident in triggered) {
        if (_announced.add(incident.id) && !roster.isMuted(incident.id)) {
          _announce(incident);
        }
      }
    }
    final desired =
        _foreground && !_terminating && (roster.shouldRing || _testing);
    if (desired == _wantsAudio) return;
    _wantsAudio = desired;
    final version = ++_audioVersion;
    _audioQueue = _audioQueue.then((_) async {
      try {
        if (!desired) {
          await _player?.release();
          return;
        }
        if (version != _audioVersion) return;
        final player = _player ??= AudioPlayer();
        try {
          await player.setAudioContext(
            AudioContext(
              android: AudioContextAndroid(
                usageType: AndroidUsageType.alarm,
                contentType: AndroidContentType.sonification,
                audioFocus: AndroidAudioFocus.gainTransientExclusive,
              ),
            ),
          );
        } catch (_) {
          debugPrint('Alarm audio context is unavailable.');
        }
        await player.setReleaseMode(ReleaseMode.loop);
        if (version != _audioVersion) return;
        try {
          await player.play(AssetSource('emr_sound.ogg'));
        } catch (_) {
          _fallback ??= await compute(_generateWavBytesIsolate, 3);
          if (version == _audioVersion) {
            await player.play(BytesSource(_fallback!, mimeType: 'audio/wav'));
          }
        }
      } catch (_) {
        if (version == _audioVersion) _wantsAudio = false;
        debugPrint('Alarm playback is unavailable.');
      }
    });
  }

  Future<void> showStudentSosSentNotification() async {
    const AndroidNotificationDetails androidDetails =
        AndroidNotificationDetails(
          'student_sos_confirmation_channel',
          'SOS Dispatch Confirmation',
          channelDescription: 'Emergency dispatch confirmation',
          importance: Importance.high,
          priority: Priority.high,
          ticker: 'SOS Dispatched',
          playSound: true,
          enableVibration: true,
          fullScreenIntent: false,
        );

    const NotificationDetails platformDetails = NotificationDetails(
      android: androidDetails,
    );

    await _showNotification(
      101,
      '🚨 SOS Alert Dispatched',
      'Your SOS has been broadcasted. Responders have your GPS coordinates and medical profile.',
      platformDetails,
    );
  }

  Future<void> showAppointmentConfirmedNotification([
    String? title,
    String? body,
  ]) async {
    const AndroidNotificationDetails androidDetails =
        AndroidNotificationDetails(
          'appointment_channel',
          '📅 Consultation Appointments',
          channelDescription:
              'Appointment booking confirmations and scheduled reminders',
          importance: Importance.high,
          priority: Priority.high,
          ticker: 'Appointment Confirmed',
          playSound: true,
          enableVibration: true,
        );

    const NotificationDetails platformDetails = NotificationDetails(
      android: androidDetails,
    );

    await _showNotification(
      102,
      title ?? '📅 Consultation Confirmed',
      body ?? 'Your consultation appointment has been scheduled successfully.',
      platformDetails,
    );
  }

  Future<void> showQueueTurnNotification({
    required String ticketNo,
    required String doctorName,
  }) async {
    const AndroidNotificationDetails androidDetails =
        AndroidNotificationDetails(
          'clinic_queue_channel',
          '🔔 Clinic Queue Turn',
          channelDescription:
              'Alerts when your queue ticket is called for consultation',
          importance: Importance.high,
          priority: Priority.high,
          ticker: 'Your Turn!',
          playSound: true,
          enableVibration: true,
        );

    const NotificationDetails platformDetails = NotificationDetails(
      android: androidDetails,
    );

    await _showNotification(
      103,
      '🔔 It\'s Your Turn! ($ticketNo)',
      'Please proceed to the consultation room with $doctorName.',
      platformDetails,
    );
  }
}
