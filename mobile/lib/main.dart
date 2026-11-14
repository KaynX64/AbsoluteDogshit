// mobile/lib/main.dart
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import 'screens/splash_screen.dart';
import 'services/emergency_alert_service.dart';
import 'services/connectivity_service.dart';
import 'theme/account_theme_controller.dart';
import 'theme/app_palette.dart';

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
        return kDebugMode; // Never allow invalid certificates in release builds
      };
  }
}

final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Security Enforcement: Restrict self-signed TLS override strictly to debug mode
  if (kDebugMode) {
    HttpOverrides.global = DevHttpOverrides();
  }

  // Only initialize native Firebase on Android / iOS
  if (!kIsWeb) {
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(
        _firebaseMessagingBackgroundHandler,
      );
      debugPrint("🔥 [Firebase] Initialized successfully.");
    } catch (e) {
      debugPrint("⚠️ [Firebase] Could not initialize: $e");
    }
  } else {
    debugPrint(
      "🌐 [Firebase] Running on Web - skipping native Firebase setup.",
    );
  }

  await EmergencyAlertService().initialize();
  await ConnectivityService().initialize();

  runApp(const ValetudoMobileApp());
}

class ValetudoMobileApp extends StatefulWidget {
  const ValetudoMobileApp({super.key, this.themeController, this.home});
  final AccountThemeController? themeController;
  final Widget? home;

  @override
  State<ValetudoMobileApp> createState() => _ValetudoMobileAppState();
}

class _ValetudoMobileAppState extends State<ValetudoMobileApp>
    with WidgetsBindingObserver {
  late final controller =
      widget.themeController ?? AccountThemeController.instance;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    ConnectivityService().addListener(_onConnectivityChanged);
  }

  void _onConnectivityChanged() {
    if (ConnectivityService().isOnline) controller.refresh();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) controller.refresh();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    ConnectivityService().removeListener(_onConnectivityChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AccountThemeScope(
      controller: controller,
      child: ListenableBuilder(
        listenable: controller,
        builder: (context, _) => MaterialApp(
          navigatorKey: navigatorKey,
          title: 'LeoVital HealthLink',
          debugShowCheckedModeBanner: false,
          theme: buildAccountTheme(controller.selection),
          home: widget.home ?? const SplashScreen(),
        ),
      ),
    );
  }
}
