import 'package:flutter/foundation.dart' show kIsWeb;
import 'dart:io' show Platform;

class ApiConfig {
  static String get baseUrl {
    if (kIsWeb) {
      return 'http://localhost:5000';
    }

    try {
      if (Platform.isAndroid) {
        return 'http://10.0.2.2:5000'; // Default Android emulator
      }
    } catch (_) {}

    return 'http://localhost:5000'; // iOS / macOS / Windows
  }
}