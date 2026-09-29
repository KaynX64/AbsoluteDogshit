// mobile/lib/main.dart
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'screens/splash_screen.dart';
import 'services/emergency_alert_service.dart';

// ── ⬇️ 1. TOP-LEVEL BACKGROUND HANDLER (Must be outside any class) ───────────
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  debugPrint("📩 [FCM Background Message]: ${message.notification?.title}");
}
// ─────────────────────────────────────────────────────────────────────────────

class DevHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    return super.createHttpClient(context)
      ..badCertificateCallback = (X509Certificate cert, String host, int port) {
        // Accept self-signed certificates during local development
        return kDebugMode;
      };
  }
}

final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Allow self-signed development certificates in debug mode
  if (kDebugMode) {
    HttpOverrides.global = DevHttpOverrides();
  }

  // ── ⬇️ 2. INITIALIZE FIREBASE & REGISTER BACKGROUND HANDLER ──────────────────
  try {
    await Firebase.initializeApp();
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
    debugPrint("🔥 [Firebase] Initialized successfully.");
  } catch (e) {
    debugPrint("⚠️ [Firebase] Could not initialize: $e");
  }
  // ─────────────────────────────────────────────────────────────────────────────

  await EmergencyAlertService().initialize();
  runApp(const ValetudoMobileApp());
}

class ValetudoMobileApp extends StatelessWidget {
  const ValetudoMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: navigatorKey,
      title: 'Valetudo HealthLink',
      theme: ThemeData(primarySwatch: Colors.teal, useMaterial3: true),
      home: const SplashScreen(),
    );
  }
}