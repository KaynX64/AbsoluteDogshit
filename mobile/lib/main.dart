// mobile/lib/main.dart
import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'screens/splash_screen.dart';
import 'services/emergency_alert_service.dart';
import 'services/connectivity_service.dart';
import 'theme/account_theme_controller.dart';
import 'theme/app_palette.dart';
import 'widgets/responder_hub.dart';

/// Allows self-signed TLS certificates in debug builds.
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

void main() {
  final binding = WidgetsFlutterBinding.ensureInitialized();

  // Security Enforcement: Restrict self-signed TLS override strictly to debug mode
  if (kDebugMode) {
    HttpOverrides.global = DevHttpOverrides();
  }

  runApp(const ValetudoMobileApp());
  unawaited(
    binding.waitUntilFirstFrameRasterized.then((_) async {
      final alerts = EmergencyAlertService();
      await Future.wait([
        alerts.initializeFirebase(),
        alerts.requestNotificationPermission(),
        ConnectivityService().initialize(),
      ]);
    }),
  );
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
  late bool _isOnline;
  final _alerts = EmergencyAlertService();
  bool _showingNotification = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _alerts.setForeground(
      WidgetsBinding.instance.lifecycleState == null ||
          WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed,
    );
    _alerts.notificationOpen.addListener(_scheduleIncidentOpen);
    _isOnline = ConnectivityService().isOnline;
    ConnectivityService().addListener(_onConnectivityChanged);
  }

  void _onConnectivityChanged() {
    final online = ConnectivityService().isOnline;
    if (online && !_isOnline) {
      unawaited(controller.refresh());
      unawaited(_alerts.recover());
    }
    _isOnline = online;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _alerts.setForeground(state == AppLifecycleState.resumed);
    if (state == AppLifecycleState.resumed) {
      controller.refresh();
      if (_alerts.notificationOpen.value != null) _scheduleIncidentOpen();
    }
  }

  void _scheduleIncidentOpen() {
    final binding = WidgetsBinding.instance;
    binding.addPostFrameCallback((_) async {
      final context = navigatorKey.currentContext;
      final id = _alerts.notificationOpen.value;
      if (!mounted ||
          context == null ||
          !context.mounted ||
          id == null ||
          _showingNotification ||
          (binding.lifecycleState != null &&
              binding.lifecycleState != AppLifecycleState.resumed)) {
        return;
      }
      _showingNotification = true;
      _alerts.notificationOpen.value = null;
      try {
        await showResponderIncident(context, id);
      } finally {
        _showingNotification = false;
        if (mounted && _alerts.notificationOpen.value != null) {
          _scheduleIncidentOpen();
        }
      }
    });
    binding.ensureVisualUpdate();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _alerts.notificationOpen.removeListener(_scheduleIncidentOpen);
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
