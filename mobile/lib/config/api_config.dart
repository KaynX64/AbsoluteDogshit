// mobile/lib/config/api_config.dart
import 'package:flutter/foundation.dart' show kIsWeb;
import 'dart:io' show Platform;
import 'package:http/http.dart' as http;

class ApiConfig {
  static final http.Client client = http.Client();

  static String get baseUrl {
    if (kIsWeb) return 'https://10.162.151.59:5000';
    try {
      if (Platform.isAndroid) {
        // If testing on an Android Emulator:
        // return 'https://10.0.2.2:5000';


        return 'https://10.162.151.59:5000'; // e.g. https://10.162.151.59:5000

      }
    } catch (_) {}
    return 'https://10.162.151.59:5000';
  }

  static String get socketUrl => baseUrl;
}