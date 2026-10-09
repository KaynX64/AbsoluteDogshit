// mobile/lib/widgets/session_timeout_listener.dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/api_config.dart';
import '../screens/login_screen.dart';

class SessionTimeoutListener extends StatefulWidget {
  final Widget child;
  final int timeoutMinutes;

  const SessionTimeoutListener({
    super.key,
    required this.child,
    this.timeoutMinutes = 480, // Default to 8 hours
  });

  @override
  State<SessionTimeoutListener> createState() => _SessionTimeoutListenerState();
}

class _SessionTimeoutListenerState extends State<SessionTimeoutListener> {
  Timer? _inactivityTimer;
  final _storage = const FlutterSecureStorage();

  static const primaryGreen = Color(0xFF284E3A);
  static const textMain = Color(0xFF191C1A);
  static const textSub = Color(0xFF5A635B);

  @override
  void initState() {
    super.initState();
    _resetTimer();
  }

  @override
  void dispose() {
    _inactivityTimer?.cancel();
    super.dispose();
  }

  void _resetTimer() {
    _inactivityTimer?.cancel();
    _inactivityTimer = Timer(Duration(minutes: widget.timeoutMinutes), _handleTimeout);
  }

  Future<void> _handleTimeout() async {
    final token = await _storage.read(key: 'jwt_token');
    if (token != null) {
      try {
        await ApiConfig.client.post(
          Uri.parse('${ApiConfig.baseUrl}/api/auth/logout'),
          headers: {'Authorization': 'Bearer $token'},
        );
      } catch (_) {}
    }
    await _storage.deleteAll();
    if (!mounted) return;

    final durationString = widget.timeoutMinutes >= 60
        ? '${(widget.timeoutMinutes / 60).round()} hours'
        : '${widget.timeoutMinutes} minutes';

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        icon: const Icon(Icons.lock_clock_outlined, color: primaryGreen, size: 48),
        title: const Text(
          'Session Expired',
          style: TextStyle(fontWeight: FontWeight.w800, color: textMain, fontSize: 18),
        ),
        content: Text(
          'For your protection under Republic Act No. 10173 (Data Privacy Act of 2012), '
          'your session has ended due to $durationString of inactivity.',
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 13, color: textSub, height: 1.4),
        ),
        actions: [
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: primaryGreen,
              foregroundColor: Colors.white,
              elevation: 0,
              shape: const StadiumBorder(),
            ),
            onPressed: () {
              Navigator.pop(ctx);
              Navigator.pushAndRemoveUntil(
                context,
                MaterialPageRoute(builder: (_) => const LoginScreen()),
                (route) => false,
              );
            },
            child: const Text('Log In Again', style: TextStyle(fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: (_) => _resetTimer(),
      onPointerMove: (_) => _resetTimer(),
      child: widget.child,
    );
  }
}