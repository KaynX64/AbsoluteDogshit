// mobile/lib/widgets/sos_alert_actions.dart
//
// Shared SOS status actions — the single status-change path for
// ResponderScreen and the EmergencyAlertService SOS dialog.
// ANY responder tier (clinical or community/qualified) may acknowledge,
// dispatch, resolve or flag a false alarm — closing an incident is an
// operational action, not a PHI disclosure, so it is not gated on the
// medical-detail tier the payload was redacted to.
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/api_config.dart';
import '../main.dart';

/// PATCH /api/emergency/:alertId/status.
///
/// Returns a result map:
///   { ok: true, status }                              on 200
///   { ok: false, error, code?, currentStatus? }       on failure
/// `currentStatus` is set for 409s so callers can tell "someone else
/// already closed it" (treat as done) apart from a real failure.
Future<Map<String, dynamic>> updateSosAlertStatus(int alertId, String status) async {
  const storage = FlutterSecureStorage();
  final token = await storage.read(key: 'jwt_token');
  if (token == null) {
    return {'ok': false, 'error': 'You are signed out. Sign in again to respond.'};
  }
  try {
    final res = await ApiConfig.client.patch(
      Uri.parse('${ApiConfig.baseUrl}/api/emergency/$alertId/status'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      },
      body: jsonEncode({'status': status}),
    );
    if (res.statusCode == 200) {
      return {'ok': true, 'status': status};
    }
    try {
      final body = jsonDecode(res.body);
      return {
        'ok': false,
        'error': body['error'] ?? 'Could not update the SOS alert.',
        'code': body['code'],
        'currentStatus': body['currentStatus'],
      };
    } catch (_) {
      return {'ok': false, 'error': 'Could not update the SOS alert. Check your connection.'};
    }
  } catch (_) {
    return {'ok': false, 'error': 'Could not update the SOS alert. Check your connection.'};
  }
}

/// True when a 409 body says the incident is already closed — the caller
/// should behave as if its own action succeeded.
bool _alreadyClosedElsewhere(Map<String, dynamic> result) {
  final current = result['currentStatus'];
  return result['code'] == 'ALERT_ALREADY_CLOSED' ||
      current == 'resolved' ||
      current == 'false_alarm';
}

class SosAlertActions extends StatefulWidget {
  final int alertId;
  final String status;

  /// Notifies the host screen after every successful status transition (or
  /// after discovering another responder closed the incident first).
  final void Function(String status)? onChanged;

  const SosAlertActions({
    super.key,
    required this.alertId,
    required this.status,
    this.onChanged,
  });

  @override
  State<SosAlertActions> createState() => _SosAlertActionsState();
}

class _SosAlertActionsState extends State<SosAlertActions> {
  late String _status;

  @override
  void initState() {
    super.initState();
    _status = widget.status;
  }

  Future<void> _run(String next) async {
    final result = await updateSosAlertStatus(widget.alertId, next);

    if (result['ok'] == true) {
      if (mounted) setState(() => _status = next);
      widget.onChanged?.call(next);
      return;
    }

    // Another responder closed the incident while we were looking at it —
    // from this device's point of view the outcome is the same: it's closed.
    if (_alreadyClosedElsewhere(result)) {
      final current = (result['currentStatus'] as String?) ?? next;
      if (mounted) setState(() => _status = current);
      widget.onChanged?.call(current);
      return;
    }

    final ctx = navigatorKey.currentContext;
    if (ctx != null && ctx.mounted) {
      ScaffoldMessenger.of(ctx).showSnackBar(
        SnackBar(
          content: Text('${result['error']}'),
          backgroundColor: const Color(0xFF7A2E26),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (_status == 'triggered')
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.amber,
                foregroundColor: Colors.black,
                minimumSize: const Size.fromHeight(42),
              ),
              onPressed: () => _run('acknowledged'),
              icon: const Icon(Icons.check_circle_outline, size: 18),
              label: const Text('ACKNOWLEDGE', style: TextStyle(fontWeight: FontWeight.w900)),
            ),
          ),
        if (_status != 'dispatched' && _status != 'resolved' && _status != 'false_alarm')
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.blue.shade700,
                foregroundColor: Colors.white,
                minimumSize: const Size.fromHeight(42),
              ),
              onPressed: () => _run('dispatched'),
              icon: const Icon(Icons.directions_run, size: 18),
              label: const Text('DISPATCH TO LOCATION', style: TextStyle(fontWeight: FontWeight.w900)),
            ),
          ),
        if (_status != 'resolved' && _status != 'false_alarm') ...[
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF15803D),
              foregroundColor: Colors.white,
              minimumSize: const Size.fromHeight(42),
            ),
            onPressed: () => _run('resolved'),
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
            onPressed: () => _run('false_alarm'),
            icon: const Icon(Icons.flag_outlined, size: 18),
            label: const Text('FALSE ALARM', style: TextStyle(fontWeight: FontWeight.w900)),
          ),
        ],
      ],
    );
  }
}
