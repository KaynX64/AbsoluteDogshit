// mobile/lib/main.dart
import 'package:flutter/material.dart';
import 'screens/splash_screen.dart';
import 'services/emergency_alert_service.dart';

final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Initialize notification channels on boot
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