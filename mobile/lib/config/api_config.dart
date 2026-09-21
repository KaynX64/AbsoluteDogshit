// mobile/lib/config/api_config.dart
import 'package:flutter/foundation.dart' show kIsWeb;
import 'dart:io' show Platform;

class ApiConfig {
  static String get baseUrl {
    if (kIsWeb) return 'https://localhost:5000';
    try {
      if (Platform.isAndroid) {
        // FIX: Use https and 10.0.2.2 for Android emulator loopback
        return 'https://10.0.2.2:5000'; 
      }
    } catch (_) {}
    return 'https://localhost:5000'; // iOS / Desktop fallback
  }
}