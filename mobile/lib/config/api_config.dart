import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:http/http.dart' as http;

class ApiConfig {
  static final http.Client client = http.Client();

  static final String baseUrl = _resolveBaseUrl();

  static String _resolveBaseUrl() {
    const configuredUrl = String.fromEnvironment('API_BASE_URL');
    if (configuredUrl.isEmpty) {
      return !kIsWeb && defaultTargetPlatform == TargetPlatform.android
          ? 'https://192.168.1.62:5000'
          : 'https://localhost:5000';
    }

    final uri = Uri.tryParse(configuredUrl.trim());
    if (uri == null ||
        uri.scheme != 'https' ||
        uri.host.isEmpty ||
        uri.authority.contains('@') ||
        (uri.path.isNotEmpty && uri.path != '/') ||
        uri.hasQuery ||
        uri.hasFragment) {
      throw StateError('API_BASE_URL must be an HTTPS origin.');
    }
    return uri.origin;
  }

  static String get socketUrl => baseUrl;
}
