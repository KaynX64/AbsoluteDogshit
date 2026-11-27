import 'dart:async';
import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:http/http.dart' as http;

import '../config/api_config.dart';
import 'clinic_api_errors.dart';

/// Bounded, memory-only data for one authenticated session. Never persists PHI.
class MobileSessionData with WidgetsBindingObserver {
  MobileSessionData({http.Client? client, DateTime Function()? now})
    : _client = client ?? ApiConfig.client,
      _now = now ?? DateTime.now;

  static final instance = MobileSessionData();
  final http.Client _client;
  final DateTime Function() _now;
  String? _token;
  int _generation = 0;
  bool _observing = false;
  bool _preloading = false;
  int _preloadRevision = 0;
  bool consented = false;
  final _cache = <String, ({Object? value, DateTime at})>{};
  final _running = <String, Future<Object?>>{};
  final _versions = <String, Object>{};
  final _changes = StreamController<String>.broadcast();
  Stream<String> get changes => _changes.stream;
  String? _slotPath;
  final schedulerState = <String, dynamic>{};
  final documentsState = <String, dynamic>{};
  PageStorageBucket bucket = PageStorageBucket();
  int get generation => _generation;
  bool isCurrent(int generation) => generation == _generation;

  void begin(String token) {
    clear();
    _token = token;
    if (!_observing) {
      WidgetsBinding.instance.addObserver(this);
      _observing = true;
    }
  }

  void clear() {
    _generation++;
    _token = null;
    consented = false;
    _preloading = false;
    _preloadRevision++;
    _cache.clear();
    _running.clear();
    _versions.clear();
    _slotPath = null;
    schedulerState.clear();
    documentsState.clear();
    bucket = PageStorageBucket();
    if (_observing) {
      WidgetsBinding.instance.removeObserver(this);
      _observing = false;
    }
  }

  void invalidate(String path, {bool notify = false}) {
    _cache.remove(path);
    _versions[path] = Object();
    _running.remove(path);
    if (notify) _changes.add(path);
  }

  void invalidateAppointments({bool notifyHistory = false}) {
    invalidate('/api/appointments/my', notify: notifyHistory);
    for (final key in {
      ..._cache.keys,
      ..._running.keys,
    }.where((key) => key.startsWith('/api/appointments/slots?')).toList()) {
      invalidate(key);
    }
  }

  Object? peek(String path, {Duration maxAge = const Duration(seconds: 60)}) {
    final value = _cache[path];
    return value != null && _now().difference(value.at) < maxAge
        ? value.value
        : null;
  }

  Future<Object?> get(
    String path,
    String? token, {
    bool force = false,
    Duration maxAge = const Duration(seconds: 60),
    http.Client? client,
  }) {
    // Standalone screens/tests can fetch without creating an authenticated cache.
    final cacheable = token != null && token == _token;
    if (cacheable &&
        path.startsWith('/api/appointments/slots?') &&
        _slotPath != path) {
      final previous = _slotPath;
      if (previous != null) {
        invalidate(previous);
        _versions.remove(previous);
      }
      _slotPath = path;
    }
    final active = cacheable ? _running[path] : null;
    if (active != null) return active;
    if (force && cacheable) invalidate(path);
    final cached = cacheable ? _cache[path] : null;
    if (cached != null && _now().difference(cached.at) < maxAge) {
      return Future.value(cached.value);
    }
    final running = cacheable ? _running[path] : null;
    if (running != null) return running;
    final generation = _generation;
    final version = _versions.putIfAbsent(path, Object.new);
    late final Future<Object?> request;
    request = Future<void>.value().then((_) async {
      try {
        final response = await (client ?? _client)
            .get(
              Uri.parse('${ApiConfig.baseUrl}$path'),
              headers: {'Authorization': 'Bearer $token'},
            )
            .timeout(const Duration(seconds: 10));
        if (response.statusCode != 200) {
          throw ClinicApiException(response.statusCode);
        }
        final value = jsonDecode(response.body);
        if (cacheable &&
            isCurrent(generation) &&
            identical(version, _versions[path])) {
          if (path.startsWith('/api/appointments/slots?')) {
            _cache.removeWhere(
              (key, _) => key.startsWith('/api/appointments/slots?'),
            );
          }
          _cache[path] = (value: value, at: _now());
        }
        return value;
      } finally {
        if (identical(_running[path], request)) _running.remove(path);
      }
    });
    if (cacheable) _running[path] = request;
    return request;
  }

  /// Called only after the initial dashboard has loaded and consent is known.
  Future<void> preload({bool Function()? canContinue}) async {
    final token = _token;
    if (token == null || !consented || _preloading) return;
    _preloading = true;
    final generation = _generation;
    final revision = _preloadRevision;
    try {
      await get(
        '/api/appointments/doctors',
        token,
        maxAge: const Duration(minutes: 5),
      );
      if (!isCurrent(generation) ||
          revision != _preloadRevision ||
          !consented ||
          canContinue?.call() == false) {
        return;
      }
      await get('/api/documents/prescriptions/my', token);
    } catch (_) {
      // Speculation must never delay navigation or surface an error.
    } finally {
      if (isCurrent(generation)) _preloading = false;
    }
  }

  @override
  void didHaveMemoryPressure() {
    _preloadRevision++;
    _cache.clear();
    _running.clear();
    _versions.clear();
    // Do not discard the user's booking draft or current tab preferences.
  }
}
