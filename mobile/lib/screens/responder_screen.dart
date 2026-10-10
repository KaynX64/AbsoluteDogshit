// mobile/lib/screens/responder_screen.dart
import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config/api_config.dart';
import '../utils/responsive.dart';
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

          if (triggeredAlert != null &&
              _lastAlertAlarmedId != triggeredAlert['alert_id']) {
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
          SnackBar(
            content: Text('Update failed: $e'),
            backgroundColor: primaryCrimson,
          ),
        );
      }
      _fetchActiveAlerts(silent: true);
    }
  }

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
    final webUri = Uri.parse(
      'https://www.google.com/maps/search/?api=1&query=$lat,$lng',
    );

    try {
      if (await canLaunchUrl(geoUri)) {
        await launchUrl(geoUri, mode: LaunchMode.externalApplication);
        return;
      }
      if (await canLaunchUrl(webUri)) {
        await launchUrl(webUri, mode: LaunchMode.externalApplication);
        return;
      }
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
    final rs = Rs.of(context);
    final maxContentWidth = rs.isTablet ? 640.0 : double.infinity;

    return Scaffold(
      backgroundColor: const Color(0xFFF7F9F6),
      appBar: PreferredSize(
        preferredSize: Size.fromHeight(rs.h(64).clamp(56.0, 74.0)),
        child: SafeArea(
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: rs.w(20),
              vertical: rs.h(8),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    ValetudoLogo(size: rs.w(34).clamp(28.0, 42.0)),
                    SizedBox(width: rs.w(8)),
                    Text(
                      'valetudo.',
                      style: TextStyle(
                        fontSize: rs.sp(18),
                        fontWeight: FontWeight.w900,
                        color: textMain,
                        letterSpacing: -0.5,
                      ),
                    ),
                  ],
                ),
                Row(
                  children: [
                    IconButton(
                      icon: Icon(
                        Icons.key,
                        size: rs.w(20).clamp(18.0, 22.0),
                        color: textSub,
                      ),
                      onPressed: () => Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => const ChangePasswordScreen(),
                        ),
                      ),
                    ),
                    IconButton(
                      icon: Icon(
                        Icons.refresh,
                        size: rs.w(20).clamp(18.0, 22.0),
                        color: textSub,
                      ),
                      onPressed: () => _fetchActiveAlerts(),
                    ),
                    IconButton(
                      icon: Icon(
                        Icons.logout,
                        size: rs.w(20).clamp(18.0, 22.0),
                        color: primaryCrimson,
                      ),
                      onPressed: () async {
                        EmergencyAlertService().stopResponderListener();
                        final token = await _storage.read(key: 'jwt_token');
                        if (token != null) {
                          try {
                            await ApiConfig.client.post(
                              Uri.parse('${ApiConfig.baseUrl}/api/auth/logout'),
                              headers: {'Authorization': 'Bearer $token'},
                            );
                          } catch (_) {}
                        }
                        await _storage.deleteAll();
                        if (!context.mounted) return;
                        Navigator.pushAndRemoveUntil(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const LoginScreen(),
                          ),
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
        child: Center(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: maxContentWidth),
            child: RefreshIndicator(
              color: primaryCrimson,
              onRefresh: () => _fetchActiveAlerts(),
              child: ListView(
                padding: EdgeInsets.symmetric(
                  horizontal: rs.w(20),
                  vertical: rs.h(8),
                ),
                children: [
                  Text(
                    'PSU QUICK-RESPONSE UNIT · DISPATCH',
                    style: TextStyle(
                      fontSize: rs.sp(10.5),
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.8,
                      color: textSub,
                    ),
                  ),
                  SizedBox(height: rs.h(4)),
                  Text(
                    'Ready to respond.',
                    style: TextStyle(
                      fontSize: rs.sp(30),
                      fontWeight: FontWeight.w800,
                      color: textMain,
                      letterSpacing: -0.5,
                    ),
                  ),
                  SizedBox(height: rs.h(4)),
                  Text(
                    'A clear view of campus emergencies and the people who need you.',
                    style: TextStyle(fontSize: rs.sp(13.5), color: textSub),
                  ),
                  SizedBox(height: rs.h(16)),

                  // System Status Banner
                  Container(
                    padding: EdgeInsets.symmetric(
                      horizontal: rs.w(14),
                      vertical: rs.h(10),
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF7EFE9),
                      borderRadius: BorderRadius.circular(rs.r(16)),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Icons.info_outline,
                          size: rs.w(18),
                          color: primaryCrimson,
                        ),
                        SizedBox(width: rs.w(8)),
                        Expanded(
                          child: Text(
                            'Live responder dashboard connected to infirmary emergency dispatch.',
                            style: TextStyle(
                              fontSize: rs.sp(12),
                              color: primaryCrimson,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  SizedBox(height: rs.h(16)),

                  // Stats Row
                  Row(
                    children: [
                      _buildStatPill(rs, 'Active incidents', '${_activeAlerts.length}'),
                      SizedBox(width: rs.w(10)),
                      _buildStatPill(rs, 'Units available', '3'),
                      SizedBox(width: rs.w(10)),
                      _buildStatPill(rs, 'Campus', 'Lingayen'),
                    ],
                  ),
                  SizedBox(height: rs.h(20)),

                  // Alerts Roster
                  if (_isLoading && _activeAlerts.isEmpty)
                    Center(
                      child: Padding(
                        padding: EdgeInsets.all(rs.h(32)),
                        child: const CircularProgressIndicator(
                          color: primaryCrimson,
                        ),
                      ),
                    )
                  else if (_activeAlerts.isEmpty)
                    Container(
                      padding: EdgeInsets.symmetric(
                        vertical: rs.h(40),
                        horizontal: rs.w(20),
                      ),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(rs.r(24)),
                        border: Border.all(color: borderColor),
                      ),
                      child: Column(
                        children: [
                          Icon(
                            Icons.check_circle_outline,
                            size: rs.w(54).clamp(44.0, 60.0),
                            color: primaryGreen,
                          ),
                          SizedBox(height: rs.h(12)),
                          Text(
                            'No Active Campus Emergencies',
                            style: TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: rs.sp(16),
                              color: textMain,
                            ),
                          ),
                          SizedBox(height: rs.h(4)),
                          Text(
                            'Campus quick-response units on standby.',
                            style: TextStyle(
                              color: textSub,
                              fontSize: rs.sp(13),
                            ),
                          ),
                        ],
                      ),
                    )
                  else
                    ..._activeAlerts.map((alert) {
                      return _buildAlertCard(rs, alert);
                    }),
                  SizedBox(height: rs.h(20)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildAlertCard(Rs rs, dynamic alert) {
    final status = (alert['status'] ?? 'triggered').toString();
    final lat = double.tryParse(alert['latitude'].toString()) ?? 0.0;
    final lng = double.tryParse(alert['longitude'].toString()) ?? 0.0;

    return Container(
      margin: EdgeInsets.only(bottom: rs.h(14)),
      padding: EdgeInsets.all(rs.w(20)),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(rs.r(24)),
        border: Border.all(color: borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Row(
                  children: [
                    Container(
                      width: rs.w(38),
                      height: rs.w(38),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF7EFE9),
                        borderRadius: BorderRadius.circular(rs.r(10)),
                      ),
                      child: Icon(
                        Icons.emergency_outlined,
                        size: rs.w(20),
                        color: primaryCrimson,
                      ),
                    ),
                    SizedBox(width: rs.w(10)),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            "${alert['first_name']} ${alert['last_name']}",
                            style: TextStyle(
                              fontSize: rs.sp(16),
                              fontWeight: FontWeight.w800,
                              color: textMain,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            "${alert['studentNo'] ?? '22-LN-0123'} · ${alert['phone'] ?? 'No contact'}",
                            style: TextStyle(
                              fontSize: rs.sp(12),
                              color: textSub,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              SizedBox(width: rs.w(8)),
              Container(
                padding: EdgeInsets.symmetric(
                  horizontal: rs.w(10),
                  vertical: rs.h(4),
                ),
                decoration: BoxDecoration(
                  color: status == 'dispatched'
                      ? const Color(0xFFE5EDE4)
                      : const Color(0xFFFDE8E8),
                  borderRadius: BorderRadius.circular(rs.r(12)),
                ),
                child: Text(
                  status.toUpperCase(),
                  style: TextStyle(
                    fontSize: rs.sp(11),
                    fontWeight: FontWeight.w700,
                    color: status == 'dispatched' ? primaryGreen : primaryCrimson,
                  ),
                ),
              ),
            ],
          ),
          SizedBox(height: rs.h(16)),

          Text(
            'BLOOD TYPE',
            style: TextStyle(
              fontSize: rs.sp(10),
              fontWeight: FontWeight.w700,
              letterSpacing: 1.2,
              color: textSub,
            ),
          ),
          SizedBox(height: rs.h(2)),
          Text(
            alert['blood_type'] ?? 'O+',
            style: TextStyle(
              fontSize: rs.sp(14),
              fontWeight: FontWeight.w700,
              color: textMain,
            ),
          ),
          SizedBox(height: rs.h(10)),

          Text(
            'KNOWN ALLERGY',
            style: TextStyle(
              fontSize: rs.sp(10),
              fontWeight: FontWeight.w700,
              letterSpacing: 1.2,
              color: textSub,
            ),
          ),
          SizedBox(height: rs.h(2)),
          Text(
            alert['allergies'] ?? 'None',
            style: TextStyle(
              fontSize: rs.sp(14),
              fontWeight: FontWeight.w700,
              color: (alert['allergies'] != null && alert['allergies'] != 'None')
                  ? primaryCrimson
                  : primaryGreen,
            ),
          ),
          SizedBox(height: rs.h(16)),

          // GPS coordinates row — fully tappable
          Material(
            color: const Color(0xFFE2EBE1),
            borderRadius: BorderRadius.circular(rs.r(14)),
            child: InkWell(
              onTap: () => _openGoogleMaps(lat, lng),
              borderRadius: BorderRadius.circular(rs.r(14)),
              child: Padding(
                padding: EdgeInsets.all(rs.w(12)),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'GPS COORDINATES',
                            style: TextStyle(
                              fontSize: rs.sp(9.5),
                              fontWeight: FontWeight.w700,
                              letterSpacing: 1.2,
                              color: textSub,
                            ),
                          ),
                          Text(
                            "${lat.toStringAsFixed(6)}, ${lng.toStringAsFixed(6)}",
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: rs.sp(13),
                              color: textMain,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    Row(
                      children: [
                        Text(
                          'Open maps',
                          style: TextStyle(
                            fontSize: rs.sp(12.5),
                            fontWeight: FontWeight.w700,
                            color: primaryGreen,
                          ),
                        ),
                        SizedBox(width: rs.w(4)),
                        Icon(
                          Icons.north_east_rounded,
                          size: rs.w(14),
                          color: primaryGreen,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
          SizedBox(height: rs.h(16)),

          if (status == 'triggered') ...[
            SizedBox(
              width: double.infinity,
              height: rs.h(44).clamp(40.0, 50.0),
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: softSage,
                  foregroundColor: primaryGreen,
                  elevation: 0,
                  shape: const StadiumBorder(),
                ),
                onPressed: () => _updateAlertStatus(alert['alert_id'], 'acknowledged'),
                child: Text(
                  'Acknowledge',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: rs.sp(13.5),
                  ),
                ),
              ),
            ),
            SizedBox(height: rs.h(8)),
          ],

          if (status != 'dispatched') ...[
            SizedBox(
              width: double.infinity,
              height: rs.h(48).clamp(44.0, 54.0),
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: primaryGreen,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: const StadiumBorder(),
                ),
                onPressed: () => _updateAlertStatus(alert['alert_id'], 'dispatched'),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      'Dispatch unit',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: rs.sp(14),
                      ),
                    ),
                    SizedBox(width: rs.w(6)),
                    const Icon(Icons.arrow_forward_rounded, size: 16),
                  ],
                ),
              ),
            ),
            SizedBox(height: rs.h(8)),
          ],

          // On compact screens the two low-priority buttons stack so
          // "False alarm" doesn't get squeezed against the edge.
          rs.isCompact
              ? Column(
                  children: [
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: primaryGreen,
                          side: const BorderSide(color: borderColor),
                          shape: const StadiumBorder(),
                          padding: EdgeInsets.symmetric(vertical: rs.h(10)),
                        ),
                        onPressed: () =>
                            _updateAlertStatus(alert['alert_id'], 'resolved'),
                        child: Text(
                          'Mark resolved',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: rs.sp(13),
                          ),
                        ),
                      ),
                    ),
                    SizedBox(height: rs.h(4)),
                    TextButton(
                      onPressed: () =>
                          _updateAlertStatus(alert['alert_id'], 'false_alarm'),
                      child: Text(
                        'False alarm',
                        style: TextStyle(
                          color: textSub,
                          fontSize: rs.sp(12.5),
                        ),
                      ),
                    ),
                  ],
                )
              : Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: primaryGreen,
                          side: const BorderSide(color: borderColor),
                          shape: const StadiumBorder(),
                        ),
                        onPressed: () =>
                            _updateAlertStatus(alert['alert_id'], 'resolved'),
                        child: Text(
                          'Mark resolved',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: rs.sp(13),
                          ),
                        ),
                      ),
                    ),
                    SizedBox(width: rs.w(8)),
                    TextButton(
                      onPressed: () =>
                          _updateAlertStatus(alert['alert_id'], 'false_alarm'),
                      child: Text(
                        'False alarm',
                        style: TextStyle(
                          color: textSub,
                          fontSize: rs.sp(12.5),
                        ),
                      ),
                    ),
                  ],
                ),
        ],
      ),
    );
  }

  Widget _buildStatPill(Rs rs, String label, String value) {
    return Expanded(
      child: Container(
        padding: EdgeInsets.symmetric(
          vertical: rs.h(14),
          horizontal: rs.w(12),
        ),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(rs.r(18)),
          border: Border.all(color: borderColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: rs.sp(11),
                color: textSub,
                fontWeight: FontWeight.w500,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            SizedBox(height: rs.h(6)),
            Text(
              value,
              style: TextStyle(
                fontSize: rs.sp(18),
                fontWeight: FontWeight.w800,
                color: textMain,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}