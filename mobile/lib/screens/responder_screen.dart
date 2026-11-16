import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../services/emergency_alert_service.dart';
import '../theme/account_theme_controller.dart';
import '../widgets/account_settings_button.dart';
import '../widgets/responder_hub.dart';
import '../widgets/sign_out_confirmation.dart';
import '../widgets/valetudo_logo.dart';
import 'login_screen.dart';

class ResponderScreen extends StatefulWidget {
  const ResponderScreen({super.key, required this.user});

  final Map<String, dynamic> user;

  @override
  State<ResponderScreen> createState() => _ResponderScreenState();
}

class _ResponderScreenState extends State<ResponderScreen> {
  final _storage = const FlutterSecureStorage();
  bool _signOutInProgress = false;

  Future<void> _handleSignOut() async {
    if (_signOutInProgress) return;
    _signOutInProgress = true;
    try {
      if (!await confirmSignOut(context) || !mounted) return;
      await _signOut();
    } finally {
      _signOutInProgress = false;
    }
  }

  Future<void> _signOut() async {
    await EmergencyAlertService().signOut(
      await _storage.read(key: 'jwt_token'),
    );
    if (mounted) AccountThemeScope.of(context).reset();
    await _storage.deleteAll();
    if (!mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Row(
        children: [
          const ValetudoLogo(),
          const SizedBox(width: 8),
          const Flexible(
            child: Text('LeoVital', overflow: TextOverflow.ellipsis),
          ),
        ],
      ),
      actions: [
        const AccountSettingsButton(),
        IconButton(
          tooltip: 'Sign out',
          onPressed: _handleSignOut,
          icon: const Icon(Icons.logout),
        ),
      ],
    ),
    body: SafeArea(
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 640),
          child: const ResponderHub(),
        ),
      ),
    ),
  );
}
