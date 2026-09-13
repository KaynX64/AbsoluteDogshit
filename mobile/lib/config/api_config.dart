import 'package:flutter/foundation.dart' show kIsWeb;
import 'dart:io' show Platform;

class ApiConfig {
  static String get baseUrl {
    if (kIsWeb) {
      return 'http://localhost:5000';
    }

    try {
      if (Platform.isAndroid) {
        // Change to your PC's Wi-Fi IP (e.g., 'http://192.168.18.116:5000') if testing on a physical phone
        return 'http://192.168.18.116:5000'; // Default for Android Emulator
      }
    } catch (_) {}

    return 'http://localhost:5000'; // iOS / macOS / Windows fallback
  }
}