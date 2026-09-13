import 'package:flutter/foundation.dart' show kIsWeb;
import 'dart:io' show Platform;

class ApiConfig {
  static String get baseUrl {
    if (kIsWeb) {
      return 'http://localhost:5000';
    }
    
    try {
      if (Platform.isAndroid) {
        return 'http://10.0.2.2:5000'; // Android Emulator[cite: 1]
      }
    } catch (_) {
      // Fallback if platform check fails
    }
    
    return 'http://localhost:5000'; // iOS / macOS / Windows / Web fallback[cite: 1]
  }
}