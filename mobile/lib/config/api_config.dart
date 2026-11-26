import 'package:http/http.dart' as http;

class ApiConfig {
  static final http.Client client = http.Client();

  static final String baseUrl = _resolveBaseUrl();

  static String _resolveBaseUrl() {
    const configuredUrl = String.fromEnvironment('API_BASE_URL');
    if (configuredUrl.isEmpty) {
      return 'https://192.168.18.116:5000';
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
