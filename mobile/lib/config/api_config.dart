import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:http/http.dart' as http;

class ApiConfig {
  static final http.Client client = http.Client();

<<<<<<< HEAD
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
=======
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
>>>>>>> c24e37f4af079c34559c65467157b7cfc1ba7643
  }

  static String get socketUrl => baseUrl;
}
