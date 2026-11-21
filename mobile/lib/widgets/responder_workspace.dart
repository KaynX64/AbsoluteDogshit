import 'dart:async';

import 'package:flutter/material.dart';

import '../services/emergency_alert_service.dart';
import '../screens/responder_records_view.dart';
import 'responder_hub.dart';

class ResponderWorkspace extends StatefulWidget {
  const ResponderWorkspace({super.key, this.service});
  final EmergencyAlertService? service;
  @override
  State<ResponderWorkspace> createState() => _ResponderWorkspaceState();
}

class _ResponderWorkspaceState extends State<ResponderWorkspace> {
  late final EmergencyAlertService service;
  int _tab = 0;
  @override
  void initState() {
    super.initState();
    service = widget.service ?? EmergencyAlertService();
    unawaited(service.refreshReportSummary());
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: Listenable.merge([service.roster, service.reportSummary]),
    builder: (context, _) {
      if (!service.roster.canManageIncidents) {
        return ResponderHub(service: service);
      }
      final count = service.reportSummary.value?.pending ?? 0;
      return Column(
        children: [
          if (_tab != 0) ActiveIncidentBanner(service: service),
          Expanded(
            child: _tab == 0
                ? ResponderHub(service: service)
                : ResponderRecordsView(
                    key: ValueKey(_tab),
                    service: service,
                    history: _tab == 1,
                  ),
          ),
          NavigationBar(
            selectedIndex: _tab,
            onDestinationSelected: (value) => setState(() => _tab = value),
            destinations: [
              const NavigationDestination(
                icon: Icon(Icons.emergency_outlined),
                selectedIcon: Icon(Icons.emergency),
                label: 'Alerts',
              ),
              const NavigationDestination(
                icon: Icon(Icons.history_outlined),
                selectedIcon: Icon(Icons.history),
                label: 'History',
              ),
              NavigationDestination(
                icon: Badge(
                  isLabelVisible: count > 0,
                  label: Text(count > 99 ? '99+' : '$count'),
                  child: const Icon(Icons.assignment_outlined),
                ),
                selectedIcon: const Icon(Icons.assignment),
                label: 'Reports',
              ),
            ],
          ),
        ],
      );
    },
  );
}
