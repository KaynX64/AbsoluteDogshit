// mobile/lib/screens/responder_screen.dart
import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config/api_config.dart';
import '../widgets/valetudo_logo.dart';
import '../services/emergency_alert_service.dart';
import 'login_screen.dart';
import 'change_password_screen.dart';

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

  static const primaryCrimson = Color(0xFF7A2E26);
  static const primaryGreen = Color(0xFF284E3A);
  static const softSage = Color(0xFFE5EDE4);
  static const textMain = Color(0xFF191C1A);
  static const textSub = Color(0xFF5A635B);
  static const borderColor = Color(0xFFE2EBE2);

  @override
  void initState() {
    super.initState();
    _fetchActiveAlerts();
    EmergencyAlertService().startResponderListener();

    _pollingTimer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => _fetchActiveAlerts(silent: true),
    );
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
      final res = await ApiConfig.client.get(
        Uri.parse('${ApiConfig.baseUrl}/api/emergency/active'),
        headers: {'Authorization': 'Bearer $token'},
      );

      if (res.statusCode == 200) {
        final List<dynamic> alertList = jsonDecode(res.body);

        if (mounted) {
          setState(() => _activeAlerts = alertList);

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
          if (a['alert_id'] == alertId) a['status'] = status;
        }
      }
    });

    final token = await _storage.read(key: 'jwt_token');
    try {
      await ApiConfig.client.patch(
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
          SnackBar(content: Text('Update failed: $e'), backgroundColor: primaryCrimson),
        );
      }
      _fetchActiveAlerts(silent: true);
    }
  }

  // Crash-proof Google Maps launcher for Android & iOS
  Future<void> _openGoogleMaps(double lat, double lng) async {
    if (lat == 0.0 && lng == 0.0) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('GPS coordinates not available for this alert.'),
            backgroundColor: primaryCrimson,
          ),
        );
      }
      return;
    }

    final geoUri = Uri.parse('geo:$lat,$lng?q=$lat,$lng');
    final webUri = Uri.parse('https://www.google.com/maps/search/?api=1&query=$lat,$lng');

    try {
      // 1. Try launching the native Google Maps app directly
      if (await canLaunchUrl(geoUri)) {
        await launchUrl(geoUri, mode: LaunchMode.externalApplication);
        return;
      }

      // 2. Try launching the web URL in Google Maps or external browser
      if (await canLaunchUrl(webUri)) {
        await launchUrl(webUri, mode: LaunchMode.externalApplication);
        return;
      }

      // 3. Fallback: attempt direct launch without pre-check
      await launchUrl(webUri, mode: LaunchMode.platformDefault);
    } catch (e) {
      debugPrint('[Maps Error]: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Could not open Google Maps: $e'),
            backgroundColor: primaryCrimson,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7F9F6),
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(64),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 8.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const ValetudoLogo(size: 34),
                    const SizedBox(width: 8),
                    const Text(
                      'valetudo.',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: textMain, letterSpacing: -0.5),
                    ),
                  ],
                ),
                Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.key, size: 20, color: textSub),
                      onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ChangePasswordScreen())),
                    ),
                    IconButton(
                      icon: const Icon(Icons.refresh, size: 20, color: textSub),
                      onPressed: () => _fetchActiveAlerts(),
                    ),
                    IconButton(
                      icon: const Icon(Icons.logout, size: 20, color: primaryCrimson),
                      onPressed: () async {
                        EmergencyAlertService().stopResponderListener();
                        await _storage.deleteAll();
                        if (!context.mounted) return;
                        Navigator.pushAndRemoveUntil(
                          context,
                          MaterialPageRoute(builder: (_) => const LoginScreen()),
                          (route) => false,
                        );
                      },
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          color: primaryCrimson,
          onRefresh: () => _fetchActiveAlerts(),
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            children: [
              const Text(
                'PSU QUICK-RESPONSE UNIT · DISPATCH',
                style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, letterSpacing: 1.8, color: textSub),
              ),
              const SizedBox(height: 4),
              const Text(
                'Ready to respond.',
                style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: textMain, letterSpacing: -0.5),
              ),
              const SizedBox(height: 4),
              const Text(
                'A clear view of campus emergencies and the people who need you.',
                style: TextStyle(fontSize: 13.5, color: textSub),
              ),
              const SizedBox(height: 16),

              // System Status Banner
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(color: const Color(0xFFF7EFE9), borderRadius: BorderRadius.circular(16)),
                child: const Row(
                  children: [
                    Icon(Icons.info_outline, size: 18, color: primaryCrimson),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Live responder dashboard connected to infirmary emergency dispatch.',
                        style: TextStyle(fontSize: 12, color: primaryCrimson, fontWeight: FontWeight.w500),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // Stats Row
              Row(
                children: [
                  _buildStatPill('Active incidents', '${_activeAlerts.length}'),
                  const SizedBox(width: 10),
                  _buildStatPill('Units available', '3'),
                  const SizedBox(width: 10),
                  _buildStatPill('Campus', 'Lingayen'),
                ],
              ),
              const SizedBox(height: 20),

              // Alerts Roster
              if (_isLoading && _activeAlerts.isEmpty)
                const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator(color: primaryCrimson)))
              else if (_activeAlerts.isEmpty)
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 20),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: borderColor),
                  ),
                  child: const Column(
                    children: [
                      Icon(Icons.check_circle_outline, size: 54, color: primaryGreen),
                      SizedBox(height: 12),
                      Text('No Active Campus Emergencies', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: textMain)),
                      SizedBox(height: 4),
                      Text('Campus quick-response units on standby.', style: TextStyle(color: textSub, fontSize: 13)),
                    ],
                  ),
                )
              else
                ..._activeAlerts.map((alert) {
                  final status = (alert['status'] ?? 'triggered').toString();
                  final lat = double.tryParse(alert['latitude'].toString()) ?? 0.0;
                  final lng = double.tryParse(alert['longitude'].toString()) ?? 0.0;

                  return Container(
                    margin: const EdgeInsets.only(bottom: 14),
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: borderColor),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                Container(
                                  width: 38,
                                  height: 38,
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFF7EFE9),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: const Icon(Icons.emergency_outlined, size: 20, color: primaryCrimson),
                                ),
                                const SizedBox(width: 10),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      "${alert['first_name']} ${alert['last_name']}",
                                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: textMain),
                                    ),
                                    Text(
                                      "${alert['studentNo'] ?? '22-LN-0123'} · ${alert['phone'] ?? 'No contact'}",
                                      style: const TextStyle(fontSize: 12, color: textSub),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: status == 'dispatched' ? const Color(0xFFE5EDE4) : const Color(0xFFFDE8E8),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(
                                status.toUpperCase(),
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: status == 'dispatched' ? primaryGreen : primaryCrimson,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),

                        const Text('BLOOD TYPE', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1.2, color: textSub)),
                        const SizedBox(height: 2),
                        Text(alert['blood_type'] ?? 'O+', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: textMain)),
                        const SizedBox(height: 10),

                        const Text('KNOWN ALLERGY', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1.2, color: textSub)),
                        const SizedBox(height: 2),
                        Text(
                          alert['allergies'] ?? 'None',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: (alert['allergies'] != null && alert['allergies'] != 'None') ? primaryCrimson : primaryGreen,
                          ),
                        ),
                        const SizedBox(height: 16),

                        // Entire Coordinates Box is wrapped in InkWell with ripple feedback
                        Material(
                          color: const Color(0xFFE2EBE1),
                          borderRadius: BorderRadius.circular(14),
                          child: InkWell(
                            onTap: () => _openGoogleMaps(lat, lng),
                            borderRadius: BorderRadius.circular(14),
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const Text(
                                        'GPS COORDINATES',
                                        style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w700, letterSpacing: 1.2, color: textSub),
                                      ),
                                      Text(
                                        "${lat.toStringAsFixed(6)}, ${lng.toStringAsFixed(6)}",
                                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: textMain),
                                      ),
                                    ],
                                  ),
                                  const Row(
                                    children: [
                                      Text(
                                        'Open maps',
                                        style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: primaryGreen),
                                      ),
                                      SizedBox(width: 4),
                                      Icon(Icons.north_east_rounded, size: 14, color: primaryGreen),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),

                        if (status == 'triggered') ...[
                          SizedBox(
                            width: double.infinity,
                            height: 44,
                            child: ElevatedButton(
                              style: ElevatedButton.styleFrom(backgroundColor: softSage, foregroundColor: primaryGreen, elevation: 0, shape: const StadiumBorder()),
                              onPressed: () => _updateAlertStatus(alert['alert_id'], 'acknowledged'),
                              child: const Text('Acknowledge', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                            ),
                          ),
                          const SizedBox(height: 8),
                        ],

                        if (status != 'dispatched') ...[
                          SizedBox(
                            width: double.infinity,
                            height: 48,
                            child: ElevatedButton(
                              style: ElevatedButton.styleFrom(backgroundColor: primaryGreen, foregroundColor: Colors.white, elevation: 0, shape: const StadiumBorder()),
                              onPressed: () => _updateAlertStatus(alert['alert_id'], 'dispatched'),
                              child: const Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text('Dispatch unit', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                                  SizedBox(width: 6),
                                  Icon(Icons.arrow_forward_rounded, size: 16),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 8),
                        ],

                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton(
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: primaryGreen,
                                  side: const BorderSide(color: borderColor),
                                  shape: const StadiumBorder(),
                                ),
                                onPressed: () => _updateAlertStatus(alert['alert_id'], 'resolved'),
                                child: const Text('Mark resolved', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                              ),
                            ),
                            const SizedBox(width: 8),
                            TextButton(
                              onPressed: () => _updateAlertStatus(alert['alert_id'], 'false_alarm'),
                              child: const Text('False alarm', style: TextStyle(color: textSub, fontSize: 12.5)),
                            ),
                          ],
                        ),
                      ],
                    ),
                  );
                }),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStatPill(String label, String value) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: borderColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(fontSize: 11, color: textSub, fontWeight: FontWeight.w500)),
            const SizedBox(height: 6),
            Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: textMain)),
          ],
        ),
      ),
    );
  }
}