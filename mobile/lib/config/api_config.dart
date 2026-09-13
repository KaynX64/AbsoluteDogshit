import 'dart:io';

class ApiConfig {
  static String get baseUrl {
    // 10.0.2.2 for Android emulator; localhost for iOS/macOS/web
    return Platform.isAndroid ? 'http://192.168.18.116:5000' : 'http://localhost:5000';
  }
}