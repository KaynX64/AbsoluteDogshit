import 'package:flutter/material.dart';

import '../services/emergency_alert_service.dart';
import '../widgets/responder_style.dart';
import 'responder_records_view.dart';

/// Mobile report access is read-only; all report forms live in desktop.
class IncidentReportsScreen extends StatelessWidget {
  const IncidentReportsScreen({super.key, required this.service});
  final EmergencyAlertService service;
  @override
  Widget build(BuildContext context) => ResponderStyle(
    child: Scaffold(
      appBar: AppBar(title: const Text('Incident reports')),
      body: ResponderRecordsView(service: service),
    ),
  );
}
