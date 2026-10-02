// mobile/lib/config/api_config.dart
import 'package:flutter/foundation.dart' show kIsWeb;
import 'dart:io' show Platform;
import 'package:http/http.dart' as http;

class ApiConfig {
  /// Persistent HTTP client that pools TCP/TLS connections with Keep-Alive.
  /// Eliminates 200-400ms of SSL handshake latency on repeated API calls.
  static final http.Client client = http.Client();

  static String get baseUrl {
    if (kIsWeb) return 'https://localhost:5000';
    try {
      if (Platform.isAndroid) {
        return 'https://192.168.18.116:5000';
      }
    } catch (_) {}
    return 'https://localhost:5000';
  }

  static String get socketUrl => baseUrl;
}