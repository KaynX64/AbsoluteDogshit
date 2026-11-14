import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import '../config/api_config.dart';

enum ThemePreset {
  brand('LeoVital', 'Classic sage green'),
  blossom('Blossom', 'White and pink'),
  sunrise('Sunrise', 'Yellow and blue');

  const ThemePreset(this.label, this.description);
  final String label;
  final String description;
}

@immutable
class AccountThemeSelection {
  const AccountThemeSelection({
    this.dark = false,
    this.preset = ThemePreset.brand,
  });

  factory AccountThemeSelection.fromJson(Map<String, dynamic> value) =>
      AccountThemeSelection(
        dark: value['theme_mode'] == 'dark',
        preset: ThemePreset.values.firstWhere(
          (preset) => preset.name == value['theme_preset'],
          orElse: () => ThemePreset.brand,
        ),
      );

  final bool dark;
  final ThemePreset preset;

  Map<String, String> toJson() => {
    'theme_mode': dark ? 'dark' : 'light',
    'theme_preset': preset.name,
  };
}

enum ThemeSaveState { idle, saving, saved, pending, storageError }

/// Account-scoped cache and serialized writes to the same preference used by desktop.
/// Session/revision guards keep late responses from changing another account's UI.
class AccountThemeController extends ChangeNotifier {
  AccountThemeController({
    this.storage = const FlutterSecureStorage(),
    http.Client? client,
  }) : _client = client ?? ApiConfig.client;

  static final instance = AccountThemeController();
  final FlutterSecureStorage storage;
  final http.Client _client;
  AccountThemeSelection _selection = const AccountThemeSelection();
  AccountThemeSelection get selection => _selection;
  ThemeSaveState _state = ThemeSaveState.idle;
  ThemeSaveState get state => _state;
  String? _accountId;
  String? _token;
  bool get isBound => _accountId != null;
  int _session = 0;
  int _revision = 0;
  bool _pending = false;
  bool _storageFailed = false;
  Future<void> _requests = Future.value();
  Future<void> _cacheWrites = Future.value();

  Future<void> bindAccount(
    Map<String, dynamic> user,
    String token, {
    bool fromCache = false,
  }) async {
    final session = ++_session;
    _accountId = user['user_id']?.toString();
    _token = _accountId == null ? null : token;
    _revision++;
    _pending = false;
    _storageFailed = false;
    _selection = AccountThemeSelection.fromJson(user);
    _state = isBound ? ThemeSaveState.saved : ThemeSaveState.idle;
    notifyListeners();
    if (!isBound) return;
    final key = _cacheKey;
    try {
      final raw = await storage.read(key: key);
      if (session != _session) return;
      if (raw != null) {
        final cached = jsonDecode(raw) as Map<String, dynamic>;
        // Pending local edits win until uploaded. Otherwise fresh account data wins.
        if (fromCache ||
            cached['pending'] == true ||
            !user.containsKey('theme_mode')) {
          _selection = AccountThemeSelection.fromJson(cached);
          _pending = cached['pending'] == true;
        }
      }
    } catch (_) {
      if (session != _session) return;
      _storageFailed = true;
    }
    if (session != _session) return;
    _state = _pending ? ThemeSaveState.pending : ThemeSaveState.saved;
    notifyListeners();
    await _persist(session);
    if (session == _session && _pending) unawaited(retry());
  }

  String get _cacheKey => 'account_theme_$_accountId';

  Future<void> select({bool? dark, ThemePreset? preset}) async {
    if (!isBound) return;
    _selection = AccountThemeSelection(
      dark: dark ?? _selection.dark,
      preset: preset ?? _selection.preset,
    );
    _revision++;
    _pending = true;
    _state = ThemeSaveState.saving;
    notifyListeners();
    final session = _session;
    await _persist(session);
    if (session == _session) await retry();
  }

  Future<void> _persist(int session) {
    if (session != _session || !isBound) return Future.value();
    final key = _cacheKey;
    final value = jsonEncode({..._selection.toJson(), 'pending': _pending});
    _cacheWrites = _cacheWrites.catchError((Object _) {}).then((_) async {
      if (session != _session) return;
      try {
        await storage.write(key: key, value: value);
        if (session == _session) _storageFailed = false;
      } catch (_) {
        if (session == _session) {
          _storageFailed = true;
          _state = ThemeSaveState.storageError;
          notifyListeners();
        }
      }
    });
    return _cacheWrites;
  }

  Future<void> retry() {
    final session = _session;
    _requests = _requests.catchError((Object _) {}).then((_) async {
      if (session != _session || !isBound || !_pending) return;
      final token = _token;
      final revision = _revision;
      final target = _selection;
      _state = ThemeSaveState.saving;
      notifyListeners();
      try {
        final response = await _client
            .put(
              Uri.parse('${ApiConfig.baseUrl}/api/profile/theme'),
              headers: {
                'Authorization': 'Bearer $token',
                'Content-Type': 'application/json',
              },
              body: jsonEncode(target.toJson()),
            )
            .timeout(const Duration(seconds: 10));
        if (session != _session || revision != _revision) return;
        _pending = response.statusCode != 200;
        _state = _pending ? ThemeSaveState.pending : ThemeSaveState.saved;
      } catch (_) {
        if (session != _session || revision != _revision) return;
        _state = ThemeSaveState.pending;
      }
      if (session != _session || revision != _revision) return;
      await _persist(session);
      if (session != _session || revision != _revision) return;
      if (_storageFailed) _state = ThemeSaveState.storageError;
      notifyListeners();
    });
    return _requests;
  }

  /// Called on reconnect/resume. Never replace unsaved local work with an older read.
  Future<void> refresh() async {
    if (!isBound) return;
    final session = _session;
    if (_pending) {
      await retry();
      return;
    }
    final revision = _revision;
    try {
      final response = await _client
          .get(
            Uri.parse('${ApiConfig.baseUrl}/api/profile/theme'),
            headers: {'Authorization': 'Bearer $_token'},
          )
          .timeout(const Duration(seconds: 10));
      if (session != _session ||
          revision != _revision ||
          response.statusCode != 200) {
        return;
      }
      _selection = AccountThemeSelection.fromJson(
        jsonDecode(response.body) as Map<String, dynamic>,
      );
      _state = ThemeSaveState.saved;
      notifyListeners();
      await _persist(session);
    } catch (_) {
      // Keep this account's cached appearance when offline or on an older server.
    }
  }

  void reset() {
    _session++;
    _revision++;
    _accountId = null;
    _token = null;
    _pending = false;
    _selection = const AccountThemeSelection();
    _state = ThemeSaveState.idle;
    notifyListeners();
  }

  @override
  void dispose() {
    _session++;
    super.dispose();
  }
}

class AccountThemeScope extends InheritedNotifier<AccountThemeController> {
  const AccountThemeScope({
    super.key,
    required AccountThemeController controller,
    required super.child,
  }) : super(notifier: controller);

  static AccountThemeController of(BuildContext context) => context
      .dependOnInheritedWidgetOfExactType<AccountThemeScope>()!
      .notifier!;
}
