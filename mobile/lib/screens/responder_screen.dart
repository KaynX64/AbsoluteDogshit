// mobile/lib/screens/responder_screen.dart
import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config/api_config.dart';
import '../services/emergency_alert_service.dart';
import 'login_screen.dart';

class ResponderScreen extends StatefulWidget {
  final Map<String, dynamic> user;
  const ResponderScreen({super.key, required this.user});

  @override
  State<ResponderScreen> createState() => _ResponderScreenState();
}

class _ResponderScreenState extends State<ResponderScreen> {
  final _storage = const FlutterSecureStorage();
  List<dynamic> _activeAlerts = [];
  bool _isLoading = false;
  Timer? _pollingTimer;
  int? _lastAlertAlarmedId;

  @override
  void initState() {
    super.initState();
    _fetchActiveAlerts();

    // Start background listener with fresh token
    EmergencyAlertService().startResponderListener();

    // Silent background polling (with fail-safe alarm trigger)
    _pollingTimer = Timer.periodic(const Duration(seconds: 4), (_) => _fetchActiveAlerts(silent: true));
  }

  @override
  void dispose() {
    _pollingTimer?.cancel();
    EmergencyAlertService().stopResponderListener();
    super.dispose();
  }

  Future<void> _fetchActiveAlerts({bool silent = false}) async {
    if (!silent) setState(() => _isLoading = true);
    final token = await _storage.read(key: 'jwt_token');

    try {
      final res = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/api/emergency/active'),
        headers: {'Authorization': 'Bearer $token'},
      );

      if (res.statusCode == 200) {
        final List<dynamic> alertList = jsonDecode(res.body);

        if (mounted) {
          setState(() {
            _activeAlerts = alertList;
          });

          // FAIL-SAFE: If an unacknowledged alert is found in the database, sound the alarm!
          final triggeredAlert = alertList.firstWhere(
            (a) => a['status'] == 'triggered',
            orElse: () => null,
          );

          if (triggeredAlert != null && _lastAlertAlarmedId != triggeredAlert['alert_id']) {
            _lastAlertAlarmedId = triggeredAlert['alert_id'];
            EmergencyAlertService().triggerEmergencyBroadcast(triggeredAlert);
          }
        }
      }
    } catch (_) {}

    if (!silent && mounted) {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _updateAlertStatus(int alertId, String status) async {
    EmergencyAlertService().stopAlarmSound();

    setState(() {
      if (status == 'resolved' || status == 'false_alarm') {
        _activeAlerts.removeWhere((a) => a['alert_id'] == alertId);
      } else {
        for (var a in _activeAlerts) {
          if (a['alert_id'] == alertId) {
            a['status'] = status;
          }
        }
      }
    });

    final token = await _storage.read(key: 'jwt_token');
    try {
      await http.patch(
        Uri.parse('${ApiConfig.baseUrl}/api/emergency/$alertId/status'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
        body: jsonEncode({'status': status}),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Update failed: $e'), backgroundColor: Colors.red),
        );
      }
      _fetchActiveAlerts(silent: true);
    }
  }

  Future<void> _openGoogleMaps(double lat, double lng) async {
    final uri = Uri.parse('https://www.google.com/maps/search/?api=1&query=$lat,$lng');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not open map provider.')),
        );
      }
    }
  }

  // Instant test of the audio siren, vibration, and dialog on this device
  void _testSirenDirectly() {
    EmergencyAlertService().triggerEmergencyBroadcast({
      'patientName': 'Daniella Movida (Test SOS)',
      'studentNo': '22-LN-0123',
      'bloodType': 'O+',
      'allergies': 'Penicillin',
      'latitude': 16.029851,
      'longitude': 120.228543,
      'googleMapsUrl': 'https://www.google.com/maps?q=16.029851,120.228543',
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.red.shade800,
        foregroundColor: Colors.white,
        title: const Text('PSU Quick-Response Unit'),
        actions: [
          IconButton(
            icon: const Icon(Icons.volume_up),
            tooltip: 'Test Siren & Alert',
            onPressed: _testSirenDirectly,
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => _fetchActiveAlerts(),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              EmergencyAlertService().stopResponderListener();
              await _storage.delete(key: 'jwt_token');
              await _storage.delete(key: 'user_data');
              if (!context.mounted) return;
              Navigator.pushAndRemoveUntil(
                context,
                MaterialPageRoute(builder: (_) => const LoginScreen()),
                (route) => false,
              );
            },
          )
        ],
      ),
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            color: Colors.red.shade50,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.shield_outlined, color: Colors.red, size: 22),
                    const SizedBox(width: 8),
                    Text(
                      "Responder: ${widget.user['first_name']} ${widget.user['last_name']}",
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Colors.red),
                    ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.red,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Text(
                    'ON CALL',
                    style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 11),
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: _isLoading && _activeAlerts.isEmpty
                ? const Center(child: CircularProgressIndicator(color: Colors.red))
                : _activeAlerts.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.check_circle_outline, size: 70, color: Colors.green.shade400),
                            const SizedBox(height: 12),
                            const Text(
                              'No Active Campus Emergencies',
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.black54),
                            ),
                            const SizedBox(height: 6),
                            const Text(
                              'Infirmary and Campus Security on standby.',
                              style: TextStyle(color: Colors.grey, fontSize: 13),
                            ),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: () => _fetchActiveAlerts(),
                        child: ListView.builder(
                          padding: const EdgeInsets.all(12),
                          itemCount: _activeAlerts.length,
                          itemBuilder: (context, index) {
                            final alert = _activeAlerts[index];
                            final status = alert['status'] ?? 'triggered';
                            final lat = double.tryParse(alert['latitude'].toString()) ?? 0.0;
                            final lng = double.tryParse(alert['longitude'].toString()) ?? 0.0;

                            return Card(
                              elevation: 3,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                                side: BorderSide(color: Colors.red.shade400, width: 1.5),
                              ),
                              margin: const EdgeInsets.only(bottom: 14),
                              child: Padding(
                                padding: const EdgeInsets.all(14.0),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        Row(
                                          children: [
                                            const Icon(Icons.warning_amber_rounded, color: Colors.red, size: 24),
                                            const SizedBox(width: 8),
                                            Text(
                                              "${alert['first_name']} ${alert['last_name']}",
                                              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                                            ),
                                          ],
                                        ),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                          decoration: BoxDecoration(
                                            color: status == 'dispatched' ? Colors.blue : Colors.red,
                                            borderRadius: BorderRadius.circular(6),
                                          ),
                                          child: Text(
                                            status.toString().toUpperCase(),
                                            style: const TextStyle(
                                                color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 8),
                                    Text("Contact: ${alert['phone'] ?? 'N/A'}", style: const TextStyle(fontSize: 13)),
                                    const SizedBox(height: 4),
                                    Row(
                                      children: [
                                        Text("Blood: ${alert['blood_type'] ?? 'Unknown'}",
                                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                                        const SizedBox(width: 14),
                                        Text(
                                          "Allergies: ${alert['allergies'] ?? 'None'}",
                                          style: TextStyle(
                                            color: (alert['allergies'] != null && alert['allergies'] != 'None')
                                                ? Colors.red
                                                : Colors.green.shade700,
                                            fontWeight: FontWeight.bold,
                                            fontSize: 13,
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 8),
                                    Container(
                                      padding: const EdgeInsets.all(10),
                                      decoration: BoxDecoration(
                                        color: Colors.grey.shade100,
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        children: [
                                          Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              const Text('GPS Coordinates:',
                                                  style: TextStyle(fontSize: 11, color: Colors.black54)),
                                              Text(
                                                "${lat.toStringAsFixed(6)}, ${lng.toStringAsFixed(6)}",
                                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                                              ),
                                            ],
                                          ),
                                          ElevatedButton.icon(
                                            style: ElevatedButton.styleFrom(
                                              backgroundColor: Colors.blue.shade700,
                                              foregroundColor: Colors.white,
                                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                            ),
                                            onPressed: () => _openGoogleMaps(lat, lng),
                                            icon: const Icon(Icons.navigation_outlined, size: 16),
                                            label: const Text('Open Maps',
                                                style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                                          ),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(height: 12),
                                    Wrap(
                                      spacing: 8,
                                      runSpacing: 6,
                                      children: [
                                        if (status == 'triggered')
                                          ElevatedButton(
                                            style: ElevatedButton.styleFrom(
                                                backgroundColor: Colors.amber.shade700, foregroundColor: Colors.white),
                                            onPressed: () => _updateAlertStatus(alert['alert_id'], 'acknowledged'),
                                            child: const Text('Acknowledge'),
                                          ),
                                        if (status != 'dispatched')
                                          ElevatedButton(
                                            style: ElevatedButton.styleFrom(
                                                backgroundColor: Colors.blue.shade700, foregroundColor: Colors.white),
                                            onPressed: () => _updateAlertStatus(alert['alert_id'], 'dispatched'),
                                            child: const Text('Dispatch Unit'),
                                          ),
                                        ElevatedButton(
                                          style: ElevatedButton.styleFrom(
                                              backgroundColor: Colors.green.shade700, foregroundColor: Colors.white),
                                          onPressed: () => _updateAlertStatus(alert['alert_id'], 'resolved'),
                                          child: const Text('Mark Resolved'),
                                        ),
                                        OutlinedButton(
                                          style: OutlinedButton.styleFrom(foregroundColor: Colors.grey.shade700),
                                          onPressed: () => _updateAlertStatus(alert['alert_id'], 'false_alarm'),
                                          child: const Text('False Alarm'),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                      ),
          ),
        ],
      ),
    );
  }
}