import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:http/http.dart' as http;
import 'dart:io';
class ApiConfig {
  static final http.Client client = http.Client();

  static String get baseUrl {
    if (kIsWeb) return 'https://10.162.151.59:5000';
    try {
      if (Platform.isAndroid) {
        // If testing on an Android Emulator:
        // return 'https://10.0.2.2:5000';

        return 'https://10.162.151.59:5000'; // e.g. https://192.168.1.15:5000
      }
    } catch (_) {}
    return 'https://10.162.151.59:5000';
  }

  static String get socketUrl => baseUrl;
}
