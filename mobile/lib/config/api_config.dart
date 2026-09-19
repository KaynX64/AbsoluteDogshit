// mobile/lib/config/api_config.dart
import 'package:flutter/foundation.dart' show kIsWeb;
import 'dart:io' show Platform;

class ApiConfig {
  static String get baseUrl {
    if (kIsWeb) return 'http://localhost:5000';
    try {
      if (Platform.isAndroid) {
        // When using `adb reverse tcp:5000 tcp:5000`, 127.0.0.1 routes straight to your PC
        return 'http://127.0.0.1:5000';
      }
    } catch (_) {}
    return 'http://localhost:5000';
  }

  // Reuse the same base URL for WebSocket / Socket.IO connections
  static String get socketUrl => baseUrl;
}