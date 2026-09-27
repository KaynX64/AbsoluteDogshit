// mobile/lib/services/emergency_alert_service.dart
import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_background/flutter_background.dart';
import '../config/api_config.dart';
import '../main.dart';

class EmergencyAlertService {
  static final EmergencyAlertService _instance = EmergencyAlertService._internal();
  factory EmergencyAlertService() => _instance;
  EmergencyAlertService._internal();

  io.Socket? _socket;
  final AudioPlayer _audioPlayer = AudioPlayer();
  final FlutterLocalNotificationsPlugin _localNotifications = FlutterLocalNotificationsPlugin();
  final _storage = const FlutterSecureStorage();

  bool _isAlarmPlaying = false;
  Timer? _vibrationTimer;
  Uint8List? _cachedWavBytes;
  bool _isInitialized = false;

  bool _isResponderActive = false;
  int? _lastAlertIdProcessed;

  // 1. Critical Channel for Responders (Plays custom emr_sound.ogg siren)
  static const AndroidNotificationChannel _responderCriticalChannel = AndroidNotificationChannel(
    'emergency_sos_channel_v4',
    '🚨 Critical Emergency SOS',
    description: 'High-priority campus emergency dispatch alerts with heads-up banners',
    importance: Importance.max,
    playSound: true,
    sound: RawResourceAndroidNotificationSound('emr_sound'),
    enableVibration: true,
    enableLights: true,
  );

  // 2. Student / Victim Confirmation Channel (Plays DEFAULT phone notification chime)
  static const AndroidNotificationChannel _studentConfirmChannel = AndroidNotificationChannel(
    'student_sos_confirmation_channel',
    'SOS Dispatch Confirmation',
    description: 'Confirmation alert when student sends an SOS emergency',
    importance: Importance.high,
    playSound: true, // Native phone default notification sound
    enableVibration: true,
  );

  // 3. Queue Turn Channel (Plays DEFAULT phone notification chime)
  static const AndroidNotificationChannel _queueTurnChannel = AndroidNotificationChannel(
    'clinic_queue_channel',
    '🔔 Clinic Queue Turn',
    description: 'Alerts when your queue ticket is called for consultation',
    importance: Importance.high,
    playSound: true, // Native phone default notification sound
    enableVibration: true,
  );

  Future<void> initialize() async {
    if (_isInitialized) return;
    _isInitialized = true;

    // 1. Initialize Android System Notification Channels
    const AndroidInitializationSettings initializationSettingsAndroid =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const InitializationSettings initializationSettings =
        InitializationSettings(android: initializationSettingsAndroid);

    await _localNotifications.initialize(initializationSettings);

    final androidImplementation = _localNotifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();

    await androidImplementation?.createNotificationChannel(_responderCriticalChannel);
    await androidImplementation?.createNotificationChannel(_studentConfirmChannel);
    await androidImplementation?.createNotificationChannel(_queueTurnChannel);
    await androidImplementation?.requestNotificationsPermission();

    // 2. Configure audio player context
    try {
      await _audioPlayer.setAudioContext(
        AudioContext(
          android: AudioContextAndroid(
            stayAwake: true,
            contentType: AndroidContentType.sonification,
            usageType: AndroidUsageType.alarm,
            audioFocus: AndroidAudioFocus.gainTransientExclusive,
          ),
        ),
      );
    } catch (_) {}

    await connectSocket();
  }

  Future<void> _enableBackgroundService() async {
    try {
      const androidConfig = FlutterBackgroundAndroidConfig(
        notificationTitle: "PSU Quick-Response Unit",
        notificationText: "Active on-call in background for campus emergencies.",
        notificationImportance: AndroidNotificationImportance.normal,
        notificationIcon: AndroidResource(name: 'ic_launcher', defType: 'mipmap'),
        enableWifiLock: true,
      );

      bool hasPermissions = await FlutterBackground.hasPermissions;
      if (!hasPermissions) {
        await FlutterBackground.initialize(androidConfig: androidConfig);
      }
      await FlutterBackground.enableBackgroundExecution();
      debugPrint('🛡️ [Background Service] Active on-call foreground service enabled.');
    } catch (e) {
      debugPrint('⚠️ [Background Service Error]: $e');
    }
  }

  Future<void> _disableBackgroundService() async {
    try {
      if (FlutterBackground.isBackgroundExecutionEnabled) {
        await FlutterBackground.disableBackgroundExecution();
        debugPrint('🛡️ [Background Service] Disabled on logout.');
      }
    } catch (_) {}
  }

  Future<void> connectSocket({bool force = false}) async {
    if (_socket != null && _socket!.connected && !force) return;

    try {
      _socket?.dispose();
      _socket = null;
    } catch (_) {}

    final token = await _storage.read(key: 'jwt_token');

    try {
      _socket = io.io(
        ApiConfig.socketUrl,
        io.OptionBuilder()
            .setTransports(['websocket', 'polling'])
            .setAuth({'token': token})
            .enableAutoConnect()
            .enableReconnection()
            .setReconnectionDelay(1500)
            .build(),
      );

      _socket!.onConnect((_) {
        debugPrint('✅ [Socket.IO Mobile] Connected to Gateway with token: ${token != null ? "VALID" : "ANON"}');
        _socket!.emit('join:responders');
      });

      _socket!.on('emergency:new_alert', (data) async {
        debugPrint('🚨 [Socket.IO Mobile] SOS Alert Broadcast Received: $data');
        final alertMap = data is Map<String, dynamic> ? data : Map<String, dynamic>.from(data);

        // Guard: Only sound alarm if device is in Responder mode
        if (!_isResponderActive) {
          debugPrint('🛡️ [Socket.IO Mobile] Ignored: Device not in responder mode.');
          return;
        }

        // Avoid self-echo if alert was initiated on this device
        final userDataStr = await _storage.read(key: 'user_data');
        if (userDataStr != null) {
          try {
            final currentUser = jsonDecode(userDataStr);
            if (currentUser['user_id'] == alertMap['userId']) {
              debugPrint('🛡️ [Socket.IO Mobile] Ignored: Alert originated from this user.');
              return;
            }
          } catch (_) {}
        }

        final alertId = alertMap['alertId'] ?? alertMap['alert_id'];
        if (_lastAlertIdProcessed == alertId && _isAlarmPlaying) return;
        _lastAlertIdProcessed = alertId;

        triggerEmergencyBroadcast(alertMap);
      });
    } catch (e) {
      debugPrint('[Socket.IO Mobile] Connection error: $e');
    }
  }

  void startResponderListener() {
    _isResponderActive = true;
    _lastAlertIdProcessed = null;
    initialize();
    connectSocket(force: true);
    _enableBackgroundService();
  }

  void stopResponderListener() {
    _isResponderActive = false;
    _lastAlertIdProcessed = null;
    stopAlarmSound();
    _disableBackgroundService();
  }

  // --- STUDENT CONFIRMATION NOTIFICATION (Default Phone Chime) ---
  Future<void> showStudentSosSentNotification() async {
    const AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
      'student_sos_confirmation_channel',
      'SOS Dispatch Confirmation',
      channelDescription: 'Emergency dispatch confirmation',
      importance: Importance.high,
      priority: Priority.high,
      ticker: 'SOS Dispatched',
      playSound: true, // Native default phone sound
      enableVibration: true,
      fullScreenIntent: false,
    );

    const NotificationDetails platformDetails = NotificationDetails(android: androidDetails);

    await _localNotifications.show(
      101,
      '🚨 SOS Alert Dispatched',
      'Your SOS has been broadcasted. Responders have your GPS coordinates and medical profile.',
      platformDetails,
    );
  }

  // --- APPOINTMENT CONFIRMATION NOTIFICATION (Default Phone Chime) ---
  Future<void> showAppointmentConfirmedNotification([String? title, String? body]) async {
    const AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
      'appointment_channel',
      'Consultation Appointments',
      channelDescription: 'Appointment booking confirmations and reminders',
      importance: Importance.high,
      priority: Priority.high,
      ticker: 'Appointment Confirmed',
      playSound: true, // Native default phone sound
    );

    const NotificationDetails platformDetails = NotificationDetails(android: androidDetails);

    await _localNotifications.show(
      102,
      title ?? '📅 Consultation Confirmed',
      body ?? 'Your consultation appointment has been scheduled successfully.',
      platformDetails,
    );
  }

  // --- CLINIC QUEUE TURN NOTIFICATION (Now uses DEFAULT Phone Chime) ---
  Future<void> showQueueTurnNotification({
    required String ticketNo,
    required String doctorName,
  }) async {
    const AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
      'clinic_queue_channel',
      '🔔 Clinic Queue Turn',
      channelDescription: 'Alerts when your queue ticket is called for consultation',
      importance: Importance.high,
      priority: Priority.high,
      ticker: 'Your Turn!',
      playSound: true, // Native default phone sound (NO custom siren)
      enableVibration: true,
    );

    const NotificationDetails platformDetails = NotificationDetails(android: androidDetails);

    await _localNotifications.show(
      103,
      '🔔 It\'s Your Turn! ($ticketNo)',
      'Please proceed to the consultation room with $doctorName.',
      platformDetails,
    );
  }

  Uint8List _generateEasSirenWav({double durationSeconds = 3.0, int sampleRate = 22050}) {
    if (_cachedWavBytes != null) return _cachedWavBytes!;

    final int numSamples = (durationSeconds * sampleRate).toInt();
    final int dataSize = numSamples * 2;
    final int fileSize = 36 + dataSize;
    final ByteData byteData = ByteData(44 + dataSize);

    // RIFF Header
    byteData.setUint8(0, 0x52); byteData.setUint8(1, 0x49); byteData.setUint8(2, 0x46); byteData.setUint8(3, 0x46);
    byteData.setUint32(4, fileSize, Endian.little);
    byteData.setUint8(8, 0x57); byteData.setUint8(9, 0x41); byteData.setUint8(10, 0x56); byteData.setUint8(11, 0x45);

    // fmt chunk
    byteData.setUint8(12, 0x66); byteData.setUint8(13, 0x6D); byteData.setUint8(14, 0x74); byteData.setUint8(15, 0x20);
    byteData.setUint32(16, 16, Endian.little);
    byteData.setUint16(20, 1, Endian.little);
    byteData.setUint16(22, 1, Endian.little);
    byteData.setUint32(24, sampleRate, Endian.little);
    byteData.setUint32(28, sampleRate * 2, Endian.little);
    byteData.setUint16(32, 2, Endian.little);
    byteData.setUint16(34, 16, Endian.little);

    // data chunk
    byteData.setUint8(36, 0x64); byteData.setUint8(37, 0x61); byteData.setUint8(38, 0x74); byteData.setUint8(39, 0x61);
    byteData.setUint32(40, dataSize, Endian.little);

    int offset = 44;
    const double f1 = 853.0;
    const double f2 = 960.0;
    const double twoPi = 2.0 * math.pi;

    for (int i = 0; i < numSamples; i++) {
      final double t = i / sampleRate;
      final double sampleValue = 0.5 * (math.sin(twoPi * f1 * t) + math.sin(twoPi * f2 * t));
      final int sample16 = (sampleValue * 28000).toInt().clamp(-32768, 32767);
      byteData.setInt16(offset, sample16, Endian.little);
      offset += 2;
    }

    _cachedWavBytes = byteData.buffer.asUint8List();
    return _cachedWavBytes!;
  }

  void playAlarmSound() async {
    if (_isAlarmPlaying) return;
    _isAlarmPlaying = true;

    try {
      try {
        await _audioPlayer.stop();
        await _audioPlayer.release();
      } catch (_) {}

      await _audioPlayer.setReleaseMode(ReleaseMode.loop);
      await _audioPlayer.setVolume(1.0);

      try {
        await _audioPlayer.play(AssetSource('emr_sound.ogg'));
      } catch (assetErr) {
        debugPrint('⚠️ AssetSource fallback to procedural WAV: $assetErr');
        final wav = _generateEasSirenWav();
        await _audioPlayer.play(BytesSource(wav, mimeType: 'audio/wav'));
      }

      _vibrationTimer?.cancel();
      _vibrationTimer = Timer.periodic(const Duration(milliseconds: 600), (timer) {
        if (!_isAlarmPlaying) {
          timer.cancel();
        } else {
          HapticFeedback.heavyImpact();
        }
      });
    } catch (e) {
      debugPrint('❌ [Audio alarm error]: $e');
    }
  }

  void stopAlarmSound() async {
    _isAlarmPlaying = false;
    _vibrationTimer?.cancel();
    try {
      await _audioPlayer.stop();
      await _audioPlayer.release();
    } catch (_) {}
  }

  // --- EMERGENCY DISPATCH BROADCAST (For Responders Only) ---
  Future<void> triggerEmergencyBroadcast(Map<String, dynamic> alertData) async {
    playAlarmSound();

    final patientName = alertData['patientName'] ??
        "${alertData['first_name'] ?? 'Unknown'} ${alertData['last_name'] ?? 'User'}";
    final studentNo = alertData['studentNo'] ?? alertData['identifier_no'] ?? 'Verified User';
    final bloodType = alertData['bloodType'] ?? alertData['blood_type'] ?? 'Unknown';
    final allergies = alertData['allergies'] ?? 'None recorded';
    final lat = double.tryParse(alertData['latitude'].toString()) ?? 0.0;
    final lng = double.tryParse(alertData['longitude'].toString()) ?? 0.0;
    final googleMapsUrl = alertData['googleMapsUrl'] ?? 'https://www.google.com/maps?q=$lat,$lng';

    const AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
      'emergency_sos_channel_v4',
      '🚨 Critical Emergency SOS',
      channelDescription: 'High-priority campus emergency dispatch alerts',
      importance: Importance.max,
      priority: Priority.high,
      ticker: 'EMERGENCY SOS',
      fullScreenIntent: true,
      enableVibration: true,
      playSound: true,
      sound: RawResourceAndroidNotificationSound('emr_sound'),
      category: AndroidNotificationCategory.alarm,
    );

    const NotificationDetails platformDetails = NotificationDetails(android: androidDetails);

    await _localNotifications.show(
      999,
      '🚨 EMERGENCY SOS: $patientName',
      'Location: ${lat.toStringAsFixed(4)}, ${lng.toStringAsFixed(4)} | Blood: $bloodType | Allergies: $allergies',
      platformDetails,
    );

    final context = navigatorKey.currentContext;
    if (context == null || !context.mounted) return;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor: const Color(0xFF7F1D1D),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: Colors.amber, width: 3),
          ),
          contentPadding: const EdgeInsets.all(16),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
                  decoration: BoxDecoration(
                    color: Colors.amber,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.warning_rounded, color: Colors.black, size: 26),
                      SizedBox(width: 8),
                      Text(
                        'EMERGENCY ALERT (CRITICAL)',
                        style: TextStyle(
                          color: Colors.black,
                          fontWeight: FontWeight.w900,
                          fontSize: 14,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'PSU DISASTER RISK REDUCTION & INFIRMARY PROTOCOL',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.bold),
                ),
                const Divider(color: Colors.white24, height: 20),

                Text(
                  patientName,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                ),
                Text('ID: $studentNo', style: const TextStyle(color: Colors.white70, fontSize: 13)),
                const SizedBox(height: 14),

                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.black45,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.red.shade400),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('🩸 Blood Type: $bloodType',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                      const SizedBox(height: 4),
                      Text('⚠️ Allergies: $allergies',
                          style: const TextStyle(color: Colors.amberAccent, fontWeight: FontWeight.bold, fontSize: 13)),
                      const SizedBox(height: 4),
                      Text('📍 Coordinates: ${lat.toStringAsFixed(5)}, ${lng.toStringAsFixed(5)}',
                          style: const TextStyle(color: Colors.white70, fontSize: 12)),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.blue.shade700,
                    foregroundColor: Colors.white,
                    minimumSize: const Size.fromHeight(42),
                  ),
                  onPressed: () async {
                    final uri = Uri.parse(googleMapsUrl);
                    if (await canLaunchUrl(uri)) {
                      await launchUrl(uri, mode: LaunchMode.externalApplication);
                    }
                  },
                  icon: const Icon(Icons.navigation, size: 18),
                  label: const Text('Open in Google Maps', style: TextStyle(fontWeight: FontWeight.bold)),
                ),
                const SizedBox(height: 10),

                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: Colors.red.shade900,
                    minimumSize: const Size.fromHeight(46),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  onPressed: () {
                    stopAlarmSound();
                    if (ctx.mounted) {
                      Navigator.pop(ctx);
                    }
                  },
                  child: const Text(
                    'SILENCE & ACKNOWLEDGE ALARM',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}