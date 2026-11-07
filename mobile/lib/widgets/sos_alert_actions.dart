// mobile/lib/widgets/sos_alert_actions.dart
//
// Shared SOS status actions — the single status-change path for
// ResponderScreen and the EmergencyAlertService SOS dialog.
// Community (non-clinical) responders may acknowledge and dispatch;
// closing an incident (resolved / false alarm) stays clinical-only.
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/api_config.dart';
import '../main.dart';

/// PATCH /api/emergency/:alertId/status. Returns true on success.
Future<bool> updateSosAlertStatus(int alertId, String status) async {
  const storage = FlutterSecureStorage();
  final token = await storage.read(key: 'jwt_token');
  if (token == null) return false;
  try {
    final res = await ApiConfig.client.patch(
      Uri.parse('${ApiConfig.baseUrl}/api/emergency/$alertId/status'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      },
      body: jsonEncode({'status': status}),
    );
    return res.statusCode == 200;
  } catch (_) {
    return false;
  }
}

class SosAlertActions extends StatelessWidget {
  final int alertId;
  final String status;

  /// False for community responders — resolve / false alarm are hidden.
  final bool showClinicalActions;

  /// Optional hook so the host screen can refresh its own state.
  final void Function(String status)? onChanged;

  const SosAlertActions({
    super.key,
    required this.alertId,
    required this.status,
    this.showClinicalActions = true,
    this.onChanged,
  });

  Future<void> _run(BuildContext context, String next) async {
    final ok = await updateSosAlertStatus(alertId, next);
    if (!ok) {
      final ctx = navigatorKey.currentContext;
      if (ctx != null && ctx.mounted) {
        ScaffoldMessenger.of(ctx).showSnackBar(
          const SnackBar(
            content: Text('Could not update the SOS alert. Check your connection.'),
            backgroundColor: Color(0xFF7A2E26),
          ),
        );
      }
      return;
    }
    onChanged?.call(next);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (status == 'triggered')
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.amber,
                foregroundColor: Colors.black,
                minimumSize: const Size.fromHeight(42),
              ),
              onPressed: () => _run(context, 'acknowledged'),
              icon: const Icon(Icons.check_circle_outline, size: 18),
              label: const Text('ACKNOWLEDGE', style: TextStyle(fontWeight: FontWeight.w900)),
            ),
          ),
        if (status != 'dispatched')
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.blue.shade700,
                foregroundColor: Colors.white,
                minimumSize: const Size.fromHeight(42),
              ),
              onPressed: () => _run(context, 'dispatched'),
              icon: const Icon(Icons.directions_run, size: 18),
              label: const Text('DISPATCH TO LOCATION', style: TextStyle(fontWeight: FontWeight.w900)),
            ),
          ),
        if (showClinicalActions) ...[
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF15803D),
              foregroundColor: Colors.white,
              minimumSize: const Size.fromHeight(42),
            ),
            onPressed: () => _run(context, 'resolved'),
            icon: const Icon(Icons.verified_outlined, size: 18),
            label: const Text('MARK RESOLVED', style: TextStyle(fontWeight: FontWeight.w900)),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.white,
              side: const BorderSide(color: Colors.white54),
              minimumSize: const Size.fromHeight(40),
            ),
            onPressed: () => _run(context, 'false_alarm'),
            icon: const Icon(Icons.flag_outlined, size: 18),
            label: const Text('FALSE ALARM', style: TextStyle(fontWeight: FontWeight.w900)),
          ),
        ],
      ],
    );
  }
}
