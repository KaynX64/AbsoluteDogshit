import 'package:flutter/foundation.dart' show kIsWeb;
import 'dart:io' show Platform;

class ApiConfig {
  static String get baseUrl {
    if (kIsWeb) return 'http://localhost:5000';
    try {
      if (Platform.isAndroid) {
        // Standard Android Emulator loopback is 10.0.2.2.
        // Replace with your PC's LAN IP if testing on a physical mobile device.
        return 'http://10.0.2.2:5000'; 
      }
    } catch (_) {}
    return 'http://localhost:5000'; // iOS / Desktop fallback
  }
}