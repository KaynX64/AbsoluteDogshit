// mobile/lib/services/emergency_alert_service.dart
import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
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

  // New channel ID forces Android to create a high-priority heads-up notification channel
  static const AndroidNotificationChannel _criticalChannel = AndroidNotificationChannel(
    'emergency_sos_channel_v3',
    '🚨 Critical Emergency SOS',
    description: 'High-priority campus emergency dispatch alerts with heads-up banners',
    importance: Importance.max,
    playSound: true,
    enableVibration: true,
    enableLights: true,
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

    // Register high-priority channel on Android
    final androidImplementation = _localNotifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();

    await androidImplementation?.createNotificationChannel(_criticalChannel);
    await androidImplementation?.requestNotificationsPermission();

    // 2. Configure audio player with safe alarm context
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

    // 3. Connect Persistent WebSocket with Auth
    try {
      final token = await _storage.read(key: 'jwt_token');

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
        debugPrint('✅ [Socket.IO Mobile] Connected to Emergency Gateway at ${ApiConfig.socketUrl}');
      });

      _socket!.on('emergency:new_alert', (data) {
        debugPrint('🚨 [Socket.IO Mobile] SOS Alert Broadcast: $data');
        final alertMap = data is Map<String, dynamic> ? data : Map<String, dynamic>.from(data);

        final isSimulated = alertMap['notes']?.toString().contains('SIMULATED') ?? false;

        // Sound alert if in responder mode, debug mode, or simulated test
        if (_isResponderActive || kDebugMode || isSimulated) {
          triggerEmergencyBroadcast(alertMap);
        }
      });
    } catch (e) {
      debugPrint('[Socket.IO Mobile] Error: $e');
    }
  }

  void startResponderListener() {
    _isResponderActive = true;
    initialize();
  }

  void stopResponderListener() {
    _isResponderActive = false;
    stopAlarmSound();
  }

  // --- 1. STUDENT CONFIRMATION NOTIFICATION DROP ---
  Future<void> showStudentSosSentNotification() async {
    const AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
      'emergency_sos_channel_v3',
      '🚨 Critical Emergency SOS',
      channelDescription: 'Emergency dispatch confirmation',
      importance: Importance.max,
      priority: Priority.high,
      ticker: 'SOS Dispatched',
      playSound: true,
      enableVibration: true,
      fullScreenIntent: true,
    );

    const NotificationDetails platformDetails = NotificationDetails(android: androidDetails);

    await _localNotifications.show(
      101,
      '🚨 SOS Alert Dispatched',
      'Your SOS has been broadcasted. Responders have your GPS coordinates and medical profile.',
      platformDetails,
    );
  }

  // --- 2. APPOINTMENT CONFIRMATION NOTIFICATION ---
  Future<void> showAppointmentConfirmedNotification([
    String? title,
    String? body,
  ]) async {
    const AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
      'appointment_channel',
      'Consultation Appointments',
      channelDescription: 'Appointment booking confirmations and reminders',
      importance: Importance.high,
      priority: Priority.high,
      ticker: 'Appointment Confirmed',
      playSound: true,
    );

    const NotificationDetails platformDetails = NotificationDetails(android: androidDetails);

    await _localNotifications.show(
      102,
      title ?? '📅 Consultation Confirmed',
      body ?? 'Your consultation appointment has been scheduled successfully.',
      platformDetails,
    );
  }

  // --- 3. CLINIC QUEUE TURN NOTIFICATION DROP ---
  Future<void> showQueueTurnNotification({
    required String ticketNo,
    required String doctorName,
  }) async {
    const AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
      'emergency_sos_channel_v3',
      '🚨 Critical Emergency SOS',
      channelDescription: 'Alerts when it is your turn for consultation',
      importance: Importance.max,
      priority: Priority.high,
      ticker: 'Your Turn!',
      playSound: true,
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

  // In-memory dual-tone EAS Siren (853Hz + 960Hz) WAV Generator
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
    try {
      _isAlarmPlaying = true;
      await _audioPlayer.stop();
      await _audioPlayer.setVolume(1.0);
      await _audioPlayer.setReleaseMode(ReleaseMode.loop);

      // Audio Cascade: Try both asset key formats; if missing, use procedural EAS siren
      try {
        await _audioPlayer.play(AssetSource('emr_sound.ogg'));
      } catch (e1) {
        debugPrint('[AudioPlayer] AssetSource("emr_sound.ogg") error: $e1. Trying "assets/emr_sound.ogg"...');
        try {
          await _audioPlayer.play(AssetSource('assets/emr_sound.ogg'));
        } catch (e2) {
          debugPrint('[AudioPlayer] Falling back to procedural in-memory EAS siren: $e2');
          final wav = _generateEasSirenWav();
          await _audioPlayer.play(BytesSource(wav));
        }
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
      debugPrint('[Audio alarm error]: $e');
    }
  }

  void stopAlarmSound() async {
    _isAlarmPlaying = false;
    _vibrationTimer?.cancel();
    try {
      await _audioPlayer.stop();
    } catch (_) {}
  }

  Future<void> triggerEmergencyBroadcast(Map<String, dynamic> alertData) async {
    playAlarmSound();

    final patientName = alertData['patientName'] ?? 'Unknown Student/Staff';
    final studentNo = alertData['studentNo'] ?? 'Verified User';
    final bloodType = alertData['bloodType'] ?? 'Unknown';
    final allergies = alertData['allergies'] ?? 'None recorded';
    final lat = double.tryParse(alertData['latitude'].toString()) ?? 0.0;
    final lng = double.tryParse(alertData['longitude'].toString()) ?? 0.0;
    final googleMapsUrl = alertData['googleMapsUrl'] ?? 'https://www.google.com/maps?q=$lat,$lng';

    // 1. DROP HEADS-UP NOTIFICATION FROM TOP OF SCREEN
    const AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
      'emergency_sos_channel_v3',
      '🚨 Critical Emergency SOS',
      channelDescription: 'High-priority campus emergency dispatch alerts',
      importance: Importance.max,
      priority: Priority.high,
      ticker: 'EMERGENCY SOS',
      fullScreenIntent: true,
      enableVibration: true,
      playSound: true,
      category: AndroidNotificationCategory.alarm,
    );

    const NotificationDetails platformDetails = NotificationDetails(android: androidDetails);

    await _localNotifications.show(
      999,
      '🚨 EMERGENCY SOS: $patientName',
      'Location: ${lat.toStringAsFixed(4)}, ${lng.toStringAsFixed(4)} | Blood: $bloodType | Allergies: $allergies',
      platformDetails,
    );

    // 2. DISPLAY FULL-SCREEN RED ALERT DIALOG
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