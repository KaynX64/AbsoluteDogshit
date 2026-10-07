// mobile/lib/main.dart
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'screens/splash_screen.dart';
import 'services/emergency_alert_service.dart';

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  debugPrint("📩 [FCM Background Message]: ${message.notification?.title}");
}

/// Allows self-signed SSL/TLS certificates even in release mode APK builds.
class DevHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    return super.createHttpClient(context)
      ..badCertificateCallback = (X509Certificate cert, String host, int port) {
        return true; // Always allow self-signed local certificates
      };
  }
}

final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  HttpOverrides.global = DevHttpOverrides();

  // Only initialize native Firebase on Android / iOS
  if (!kIsWeb) {
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
      debugPrint("🔥 [Firebase] Initialized successfully.");
    } catch (e) {
      debugPrint("⚠️ [Firebase] Could not initialize: $e");
    }
  } else {
    debugPrint("🌐 [Firebase] Running on Web - skipping native Firebase setup.");
  }

  await EmergencyAlertService().initialize();
  runApp(const ValetudoMobileApp());
}

class ValetudoMobileApp extends StatelessWidget {
  const ValetudoMobileApp({super.key});

  static const Color primaryGreen = Color(0xFF284E3A);
  static const Color scaffoldBg = Color(0xFFF7F9F6);
  static const Color softSage = Color(0xFFE5EDE4);
  static const Color textMain = Color(0xFF191C1A);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: navigatorKey,
      title: 'Valetudo HealthLink',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: scaffoldBg,
        colorScheme: ColorScheme.fromSeed(
          seedColor: primaryGreen,
          primary: primaryGreen,
          surface: scaffoldBg,
          onSurface: textMain,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: scaffoldBg,
          elevation: 0,
          scrolledUnderElevation: 0,
          iconTheme: IconThemeData(color: textMain),
          titleTextStyle: TextStyle(
            color: textMain,
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
        navigationBarTheme: NavigationBarThemeData(
          backgroundColor: scaffoldBg,
          indicatorColor: softSage,
          labelTextStyle: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.selected)) {
              return const TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
                color: primaryGreen,
              );
            }
            return const TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w500,
              color: Color(0xFF5A635B),
            );
          }),
          iconTheme: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.selected)) {
              return const IconThemeData(color: primaryGreen);
            }
            return const IconThemeData(color: Color(0xFF5A635B));
          }),
        ),
      ),
      home: const SplashScreen(),
    );
  }
}