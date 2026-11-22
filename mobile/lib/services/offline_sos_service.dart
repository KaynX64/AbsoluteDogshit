import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

import '../config/api_config.dart';

class SosSyncResult {
  const SosSyncResult({
    this.accepted = 0,
    this.pending = 0,
    this.unsent = 0,
    this.reauthenticate = false,
    this.retryIn,
  });

  final int accepted;
  final int pending;
  final int unsent;
  final bool reauthenticate;
  final Duration? retryIn;

  String? get message {
    final parts = [
      if (accepted > 0) 'Campus server accepted $accepted SOS alert(s).',
      if (reauthenticate) 'Sign in again to retry queued SOS alerts.',
      if (pending > 0 && !reauthenticate)
        '$pending SOS alert(s) queued. Use the call buttons if you need help now.',
      if (unsent > 0)
        '$unsent SOS alert(s) expired or were rejected. Use the call buttons if you need help now.',
    ];
    return parts.isEmpty ? null : parts.join(' ');
  }
}

/// Stores contacts and SOS requests only under a verified account identity.
class OfflineSosService {
  OfflineSosService._(this._now);
  static final _instance = OfflineSosService._(DateTime.now);
  factory OfflineSosService() => _instance;
  @visibleForTesting
  OfflineSosService.test(DateTime Function() now) : this._(now);

  final DateTime Function() _now;

  final _storage = const FlutterSecureStorage();
  final _random = Random.secure();
  Future<void> _storageTail = Future.value();
  final _replays = <String, Future<SosSyncResult>>{};
  final _retryAt = <String, DateTime>{};

  String _contactsKey(String account) =>
      'offline_emergency_contacts_v2_$account';
  String _queueKey(String account) => 'offline_sos_queue_v2_$account';

  Future<void> cacheEmergencyInfo(
    String account, {
    String? name,
    String? phone,
  }) async {
    final key = _contactsKey(account);
    if (phone == null || phone.trim().isEmpty) {
      await _storage.delete(key: key);
    } else {
      await _storage.write(
        key: key,
        value: jsonEncode({'contact_name': name, 'contact_phone': phone}),
      );
    }
  }

  Future<Map<String, dynamic>?> readCachedEmergencyInfo(String? account) async {
    if (account == null) return null;
    final raw = await _storage.read(key: _contactsKey(account));
    if (raw == null) return null;
    try {
      final value = jsonDecode(raw);
      return value is Map<String, dynamic> ? value : null;
    } on FormatException {
      return null;
    }
  }

  Future<void> queueSos(
    String account, {
    required double latitude,
    required double longitude,
  }) => _changeQueue(account, (queue) {
    queue.add({
      'client_sos_id': List.generate(
        16,
        (_) => _random.nextInt(256).toRadixString(16).padLeft(2, '0'),
      ).join(),
      'latitude': latitude,
      'longitude': longitude,
      'created_at': _now().toUtc().toIso8601String(),
    });
  });

  Future<List<Map<String, dynamic>>> _readQueue(String account) async {
    final raw = await _storage.read(key: _queueKey(account));
    if (raw == null) return [];
    try {
      final decoded = jsonDecode(raw);
      return decoded is List
          ? decoded.whereType<Map<String, dynamic>>().toList()
          : [];
    } on FormatException {
      return [];
    }
  }

  Future<void> _changeQueue(
    String account,
    void Function(List<Map<String, dynamic>>) change,
  ) {
    // Serialize read/modify/write so reconciliation cannot discard a newer alert.
    final operation = _storageTail.then((_) async {
      final queue = await _readQueue(account);
      change(queue);
      final key = _queueKey(account);
      if (queue.isEmpty) {
        await _storage.delete(key: key);
      } else {
        await _storage.write(key: key, value: jsonEncode(queue));
      }
    });
    _storageTail = operation.then<void>(
      (_) {},
      onError: (Object _, StackTrace _) {},
    );
    return operation;
  }

  Future<SosSyncResult> sync({
    required String account,
    required String token,
    required http.Client client,
    required bool Function() isCurrent,
    required bool online,
  }) => _replays[account] ??= _sync(account, token, client, isCurrent, online)
      .whenComplete(() {
        _replays.remove(account);
      });

  Future<SosSyncResult> _sync(
    String account,
    String token,
    http.Client client,
    bool Function() isCurrent,
    bool online,
  ) async {
    await _storageTail;
    final queue = await _readQueue(account);
    if (!isCurrent()) return const SosSyncResult();
    var accepted = 0;
    var unsent = 0;
    var reauthenticate = false;
    var retryIn = _retryAt[account]?.difference(_now());
    if (retryIn != null && retryIn <= Duration.zero) retryIn = null;
    final handled = <String>{};

    for (final event in queue) {
      final id = event['client_sos_id'] as String;
      final created = DateTime.tryParse(event['created_at']?.toString() ?? '');
      if (created == null ||
          _now().difference(created) >= const Duration(minutes: 15)) {
        handled.add(id);
        unsent++;
        continue;
      }
      if (!online || !isCurrent() || retryIn != null || reauthenticate) {
        continue;
      }
      try {
        final response = await client
            .post(
              Uri.parse('${ApiConfig.baseUrl}/api/emergency/sos/requests'),
              headers: {
                'Authorization': 'Bearer $token',
                'Content-Type': 'application/json',
              },
              body: jsonEncode({
                'client_sos_id': id,
                'latitude': event['latitude'],
                'longitude': event['longitude'],
              }),
            )
            .timeout(const Duration(seconds: 8));
        final status = response.statusCode;
        if (status == 200 || status == 201) {
          final receipt = jsonDecode(response.body);
          if (receipt is! Map || receipt['alertId'] is! int) {
            throw const FormatException('Missing SOS receipt');
          }
          handled.add(id);
          accepted++;
        } else if (status == 401 || status == 403) {
          reauthenticate = true;
        } else if (status == 429 || status == 408 || status >= 500) {
          final seconds =
              int.tryParse(response.headers['retry-after'] ?? '') ?? 15;
          retryIn = Duration(seconds: max(seconds, 1));
        } else {
          handled.add(id);
          unsent++;
        }
      } catch (_) {
        retryIn = const Duration(seconds: 15);
      }
    }

    if (handled.isNotEmpty) {
      await _changeQueue(account, (current) {
        current.removeWhere(
          (event) => handled.contains(event['client_sos_id']),
        );
      });
    }
    final pending = (await _readQueue(account)).length;
    if (retryIn != null && pending > 0) {
      _retryAt[account] = _now().add(retryIn);
    } else {
      _retryAt.remove(account);
    }
    return SosSyncResult(
      accepted: accepted,
      unsent: unsent,
      pending: pending,
      retryIn: pending > 0 ? retryIn : null,
      reauthenticate: reauthenticate,
    );
  }

  Future<bool> dialNumber(String phone) =>
      _launch(Uri(scheme: 'tel', path: phone));

  Future<bool> composeEmergencySms(String phone, {String? body}) => _launch(
    Uri(
      scheme: 'sms',
      path: phone,
      queryParameters: body != null ? {'body': body} : null,
    ),
  );

  Future<bool> _launch(Uri uri) async {
    try {
      return await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      return false;
    }
  }
}
