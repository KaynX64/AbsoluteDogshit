// mobile/lib/main.dart
import 'dart:io';
import 'package:flutter/material.dart';
import 'screens/login_screen.dart';
import 'widgets/session_timeout_listener.dart'; 

// FIX: Custom override to trust local self-signed HTTPS certificates
class MyHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    return super.createHttpClient(context)
      ..badCertificateCallback = (X509Certificate cert, String host, int port) => true;
  }
}

void main() {
  // Apply the certificate override globally before running the app
  HttpOverrides.global = MyHttpOverrides();
  runApp(const ValetudoApp());
}

class ValetudoApp extends StatelessWidget {
  const ValetudoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return SessionTimeoutListener(
      child: MaterialApp(
        title: 'Valetudo HealthLink',
        theme: ThemeData(
          primaryColor: const Color(0xFF0F766E),
        ),
        home: const LoginScreen(),
      ),
    );
  }
}