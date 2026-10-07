// mobile/lib/services/connectivity_service.dart
import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

/// Tracks OS-level network connectivity and notifies listeners on change.
///
/// This is the ground truth for "am I offline?" — the Android/iOS network
/// stack knows the answer faster and more reliably than any HTTP probe.
class ConnectivityService extends ChangeNotifier {
  static final ConnectivityService _instance = ConnectivityService._internal();
  factory ConnectivityService() => _instance;
  ConnectivityService._internal();

  final Connectivity _connectivity = Connectivity();
  StreamSubscription<List<ConnectivityResult>>? _sub;

  bool _isOnline = true;
  bool get isOnline => _isOnline;

  /// Human-readable label of the current transport, useful for banners.
  String _transport = 'Unknown';
  String get transport => _transport;

  Future<void> initialize() async {
    final initial = await _connectivity.checkConnectivity();
    _applyResults(initial);

    _sub = _connectivity.onConnectivityChanged.listen(_applyResults);
  }

  void _applyResults(List<ConnectivityResult> results) {
    // connectivity_plus can return multiple transports at once (e.g. wifi + vpn)
    final online = results.any((r) => r != ConnectivityResult.none);
    final newTransport = _describeTransport(results);

    if (online != _isOnline || newTransport != _transport) {
      _isOnline = online;
      _transport = newTransport;
      notifyListeners();
    }
  }

  String _describeTransport(List<ConnectivityResult> results) {
    if (results.contains(ConnectivityResult.wifi)) return 'WiFi';
    if (results.contains(ConnectivityResult.mobile)) return 'Cellular';
    if (results.contains(ConnectivityResult.ethernet)) return 'Ethernet';
    if (results.contains(ConnectivityResult.vpn)) return 'VPN';
    if (results.contains(ConnectivityResult.none)) return 'Offline';
    return 'Unknown';
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}