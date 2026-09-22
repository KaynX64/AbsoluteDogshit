// mobile/lib/config/api_config.dart
import 'package:flutter/foundation.dart' show kIsWeb;
import 'dart:io' show Platform;

class ApiConfig {
  static String get baseUrl {
    if (kIsWeb) return 'https://localhost:5000';
    try {
      if (Platform.isAndroid) {
        // Use HTTPS
        return 'https://192.168.18.116:5000';
      }
    } catch (_) {}
    return 'https://localhost:5000';
  }

  static String get socketUrl => baseUrl;
}