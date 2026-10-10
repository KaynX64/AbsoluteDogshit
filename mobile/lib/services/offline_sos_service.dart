// mobile/lib/services/offline_sos_service.dart
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:url_launcher/url_launcher.dart';

/// Handles emergency response when the app has no network connectivity.
///
/// Strategy:
///   • While online, cache emergency contacts + medical indicators locally.
///   • When offline, offer the user native call/SMS buttons (work without data).
///   • Queue the SOS event so it auto-delivers when connectivity returns.
class OfflineSosService {
  static final OfflineSosService _instance = OfflineSosService._internal();
  factory OfflineSosService() => _instance;
  OfflineSosService._internal();

  final _storage = const FlutterSecureStorage();

  static const String _cacheKey = 'offline_emergency_contacts';
  static const String _queueKey = 'offline_sos_queue';

  /// Cache the user's emergency contacts + critical medical info.
  /// Call this every time the profile is successfully fetched while online.
  Future<void> cacheEmergencyInfo({
    required String contactName,
    required String contactPhone,
    String? bloodType,
    String? allergies,
    String? chronicConditions,
  }) async {
    final payload = {
      'contact_name': contactName,
      'contact_phone': contactPhone,
      'blood_type': bloodType ?? 'Unknown',
      'allergies': allergies ?? 'None reported',
      'chronic_conditions': chronicConditions ?? 'None reported',
      'cached_at': DateTime.now().toIso8601String(),
    };
    await _storage.write(key: _cacheKey, value: jsonEncode(payload));
  }

  Future<Map<String, dynamic>?> readCachedEmergencyInfo() async {
    final raw = await _storage.read(key: _cacheKey);
    if (raw == null) return null;
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  /// Queue an SOS event for delivery when connectivity returns.
  /// Persists across app restarts and process kills.
  Future<void> queueOfflineSos({
    required double latitude,
    required double longitude,
    String? notes,
  }) async {
    final queue = await _readQueue();
    queue.add({
      'client_sos_id': 'OFFLINE-${DateTime.now().millisecondsSinceEpoch}',
      'latitude': latitude,
      'longitude': longitude,
      'notes': notes ?? 'Offline SOS triggered — awaiting connectivity',
      'created_at': DateTime.now().toIso8601String(),
    });
    await _storage.write(key: _queueKey, value: jsonEncode(queue));
  }

  Future<List<Map<String, dynamic>>> pendingSosEvents() async {
    return _readQueue();
  }

  Future<void> clearQueue() async {
    await _storage.delete(key: _queueKey);
  }

  /// Replace the queue with whatever is still pending (used by replay logic).
  Future<void> savePendingQueue(List<Map<String, dynamic>> pending) async {
    if (pending.isEmpty) {
      await _storage.delete(key: _queueKey);
    } else {
      await _storage.write(key: _queueKey, value: jsonEncode(pending));
    }
  }

  Future<List<Map<String, dynamic>>> _readQueue() async {
    final raw = await _storage.read(key: _queueKey);
    if (raw == null) return [];
    try {
      final list = jsonDecode(raw);
      if (list is List) return list.cast<Map<String, dynamic>>();
      return [];
    } catch (_) {
      return [];
    }
  }

  /// Open the native dialer with the given number pre-filled.
  /// Works with zero network connectivity — the OS handles the call.
  Future<bool> dialNumber(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone);
    try {
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
        return true;
      }
      await launchUrl(uri);
      return true;
    } catch (e) {
      debugPrint('[OfflineSosService] Dial failed: $e');
      return false;
    }
  }

  /// Open the native SMS composer with a pre-filled emergency message.
  /// SMS rides the cellular signal and works without data connectivity.
  Future<bool> composeEmergencySms(String phone, {String? body}) async {
    final uri = Uri(
      scheme: 'sms',
      path: phone,
      queryParameters: body != null ? {'body': body} : null,
    );
    try {
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
        return true;
      }
      await launchUrl(uri);
      return true;
    } catch (e) {
      debugPrint('[OfflineSosService] SMS failed: $e');
      return false;
    }
  }
}