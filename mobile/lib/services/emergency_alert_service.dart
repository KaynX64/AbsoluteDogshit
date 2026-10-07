// mobile/lib/services/emergency_alert_service.dart
import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_background/flutter_background.dart';
import '../config/api_config.dart';
import '../main.dart';

// Top-level function executed on a background isolate to avoid UI thread jank
Uint8List _generateWavBytesIsolate(int durationSeconds) {
  const int sampleRate = 22050;
  final int numSamples = durationSeconds * sampleRate;
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

  return byteData.buffer.asUint8List();
}

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
  bool _isFcmListening = false;
  StreamSubscription<String>? _tokenRefreshSub;

  bool _isResponderActive = false;
  int? _lastAlertIdProcessed;

  // 1. Critical Channel for Responders
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

  // 2. Student Confirmation Channel
  static const AndroidNotificationChannel _studentConfirmChannel = AndroidNotificationChannel(
    'student_sos_confirmation_channel',
    'SOS Dispatch Confirmation',
    description: 'Confirmation alert when student sends an SOS emergency',
    importance: Importance.high,
    playSound: true,
    enableVibration: true,
  );

  // 3. Queue Turn Channel
  static const AndroidNotificationChannel _queueTurnChannel = AndroidNotificationChannel(
    'clinic_queue_channel',
    '🔔 Clinic Queue Turn',
    description: 'Alerts when your queue ticket is called for consultation',
    importance: Importance.high,
    playSound: true,
    enableVibration: true,
  );

  // 4. Consultation Appointments Channel
  static const AndroidNotificationChannel _appointmentChannel = AndroidNotificationChannel(
    'appointment_channel',
    '📅 Consultation Appointments',
    description: 'Appointment booking confirmations and scheduled reminders',
    importance: Importance.high,
    playSound: true,
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
    await androidImplementation?.createNotificationChannel(_appointmentChannel);
    await androidImplementation?.requestNotificationsPermission();

    // 2. Pre-generate procedural WAV on background isolate so UI never stutters during alarm
    compute(_generateWavBytesIsolate, 3).then((bytes) {
      _cachedWavBytes = bytes;
    }).catchError((_) {});

    // 3. Configure audio player context
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


  // --- FIREBASE CLOUD MESSAGING (FCM) TOKEN REGISTRATION ---
  Future<void> syncFcmTokenWithBackend() async {
      if (kIsWeb) return; // Skip FCM token registration on Web
    try {
      final messaging = FirebaseMessaging.instance;
      
      await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );

      String? token = await messaging.getToken();


      if (token != null && token.isNotEmpty) {
        await _postTokenToServer(token);
      }

      // Handle automatic FCM token rotation
      _tokenRefreshSub?.cancel();
      _tokenRefreshSub = messaging.onTokenRefresh.listen((newToken) async {
        if (newToken.isNotEmpty) {
          await _postTokenToServer(newToken);
        }
      });

      if (!_isFcmListening) {
        _isFcmListening = true;
        FirebaseMessaging.onMessage.listen((RemoteMessage message) {
          final type = message.data['type'] ?? '';

          if (type == 'EMERGENCY_SOS') {
            if (_isResponderActive) {
              triggerEmergencyBroadcast(message.data);
            }
          } else if (type == 'QUEUE_TURN') {
            showQueueTurnNotification(
              ticketNo: message.data['ticketNo'] ?? message.data['ticket_no'] ?? 'Your Ticket',
              doctorName: message.data['doctorName'] ?? message.data['doctor_name'] ?? 'Attending Doctor',
            );
          } else {
            showAppointmentConfirmedNotification(
              message.notification?.title ?? message.data['title'],
              message.notification?.body ?? message.data['body'],
            );
          }
        });
      }
    } catch (e) {
      debugPrint("❌ [FCM Mobile Token Error]: $e");
    }
  }

  Future<void> _postTokenToServer(String token) async {
    try {
      final jwt = await _storage.read(key: 'jwt_token');
      if (jwt != null) {
        await ApiConfig.client.post(
          Uri.parse('${ApiConfig.baseUrl}/api/profile/fcm-token'),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $jwt',
          },
          body: jsonEncode({'fcm_token': token, 'device_type': 'android'}),
        );
      }
    } catch (e) {
      debugPrint("⚠️ [FCM Post Token Error]: $e");
    }
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
    } catch (e) {
      debugPrint('⚠️ [Background Service Error]: $e');
    }
  }

  Future<void> _disableBackgroundService() async {
    try {
      if (FlutterBackground.isBackgroundExecutionEnabled) {
        await FlutterBackground.disableBackgroundExecution();
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
        // Only join privileged responder room if user is actively in responder mode
        if (_isResponderActive) {
          _socket!.emit('join:responders');
        }
      });

      _socket!.on('emergency:new_alert', (data) async {
        final alertMap = data is Map<String, dynamic> ? data : Map<String, dynamic>.from(data);

        if (!_isResponderActive) return;

        final userDataStr = await _storage.read(key: 'user_data');
        if (userDataStr != null) {
          try {
            final currentUser = jsonDecode(userDataStr);
            if (currentUser['user_id'] == alertMap['userId']) return;
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
    syncFcmTokenWithBackend();
  }

  void stopResponderListener() {
    _isResponderActive = false;
    _lastAlertIdProcessed = null;
    stopAlarmSound();
    _disableBackgroundService();
  }

  Future<void> showStudentSosSentNotification() async {
    const AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
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

    const NotificationDetails platformDetails = NotificationDetails(android: androidDetails);

    await _localNotifications.show(
      101,
      '🚨 SOS Alert Dispatched',
      'Your SOS has been broadcasted. Responders have your GPS coordinates and medical profile.',
      platformDetails,
    );
  }

  Future<void> showAppointmentConfirmedNotification([String? title, String? body]) async {
    const AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
      'appointment_channel',
      '📅 Consultation Appointments',
      channelDescription: 'Appointment booking confirmations and scheduled reminders',
      importance: Importance.high,
      priority: Priority.high,
      ticker: 'Appointment Confirmed',
      playSound: true,
      enableVibration: true,
    );

    const NotificationDetails platformDetails = NotificationDetails(android: androidDetails);

    await _localNotifications.show(
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
    const AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
      'clinic_queue_channel',
      '🔔 Clinic Queue Turn',
      channelDescription: 'Alerts when your queue ticket is called for consultation',
      importance: Importance.high,
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
        // Fallback to pre-cached procedural WAV bytes if asset cannot be opened
        _cachedWavBytes ??= await compute(_generateWavBytesIsolate, 3);
        await _audioPlayer.play(BytesSource(_cachedWavBytes!, mimeType: 'audio/wav'));
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