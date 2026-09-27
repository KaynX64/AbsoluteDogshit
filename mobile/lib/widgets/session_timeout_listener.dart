// mobile/lib/widgets/session_timeout_listener.dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
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
    await _storage.deleteAll();
    if (!mounted) return;

    final durationString = widget.timeoutMinutes >= 60
        ? '${(widget.timeoutMinutes / 60).round()} hours'
        : '${widget.timeoutMinutes} minutes';

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.lock_clock, color: Colors.teal, size: 48),
        title: const Text('Session Expired', style: TextStyle(fontWeight: FontWeight.bold)),
        content: Text(
          'For your protection under Republic Act No. 10173 (Data Privacy Act of 2012), '
          'your session has ended due to $durationString of inactivity.',
          textAlign: TextAlign.center,
        ),
        actions: [
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0F766E),
              foregroundColor: Colors.white,
            ),
            onPressed: () {
              Navigator.pop(ctx);
              Navigator.pushAndRemoveUntil(
                context,
                MaterialPageRoute(builder: (_) => const LoginScreen()),
                (route) => false,
              );
            },
            child: const Text('Log In Again'),
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