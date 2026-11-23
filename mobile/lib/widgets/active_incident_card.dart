import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/emergency_alert_service.dart';
import '../services/responder_roster.dart';
import 'responder_style.dart';
import 'sos_alert_actions.dart';

Future<void> openIncidentMap(BuildContext context, Incident incident) async {
  final lat = incident.latitude, lng = incident.longitude;
  if (lat == null || lng == null) return;
  try {
    if (await launchUrl(
      Uri.https('www.google.com', '/maps/search/', {
        'api': '1',
        'query': '$lat,$lng',
      }),
      mode: LaunchMode.externalApplication,
    )) {
      return;
    }
  } catch (_) {
    /* Keep the alert available when an external app fails. */
  }
  if (context.mounted) {
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('Could not open Maps.')));
  }
}

class ActiveIncidentCard extends StatelessWidget {
  const ActiveIncidentCard({
    super.key,
    required this.incident,
    required this.service,
    required this.onDetails,
  });
  final Incident incident;
  final EmergencyAlertService service;
  final VoidCallback onDetails;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context), colors = theme.colorScheme;
    final urgent = incident.status == IncidentStatus.triggered;
    final color = urgent ? colors.error : colors.primary;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 0,
      clipBehavior: Clip.antiAlias,
      color: colors.surfaceContainerLowest,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(
          color: urgent
              ? colors.error.withValues(alpha: .5)
              : colors.outlineVariant,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: urgent
                        ? colors.errorContainer
                        : colors.primaryContainer,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    Icons.emergency_outlined,
                    size: 22,
                    color: urgent
                        ? colors.onErrorContainer
                        : colors.onPrimaryContainer,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        incident.patientName,
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        incident.identifier ?? incident.roleLabel,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: colors.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                if (urgent)
                  IconButton(
                    tooltip: service.roster.isMuted(incident.id)
                        ? 'Unmute incident siren'
                        : 'Mute incident siren',
                    onPressed: () => service.roster.toggleMute(incident.id),
                    icon: Icon(
                      service.roster.isMuted(incident.id)
                          ? Icons.volume_off_outlined
                          : Icons.volume_up_outlined,
                      color: color,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ResponderBadge(
                  label: incident.status.label,
                  icon: switch (incident.status) {
                    IncidentStatus.triggered =>
                      Icons.notification_important_outlined,
                    IncidentStatus.acknowledged => Icons.check_rounded,
                    _ => Icons.near_me_outlined,
                  },
                  danger: urgent,
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.place_outlined, size: 18, color: color),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    incident.reportedLocation,
                    style: theme.textTheme.bodyMedium,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            LayoutBuilder(
              builder: (context, constraints) {
                final details = OutlinedButton.icon(
                  onPressed: onDetails,
                  icon: const Icon(Icons.open_in_new_rounded, size: 18),
                  label: const Text('View details'),
                  style: _buttonStyle(context),
                );
                final maps = OutlinedButton.icon(
                  onPressed:
                      incident.latitude == null || incident.longitude == null
                      ? null
                      : () => openIncidentMap(context, incident),
                  icon: const Icon(Icons.directions_outlined, size: 18),
                  label: const Text('Navigate'),
                  style: _buttonStyle(context),
                );
                final stack =
                    constraints.maxWidth < 280 ||
                    MediaQuery.textScalerOf(context).scale(13) > 18;
                if (stack) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [details, const SizedBox(height: 12), maps],
                  );
                }
                return IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(child: details),
                      const SizedBox(width: 12),
                      Expanded(child: maps),
                    ],
                  ),
                );
              },
            ),
            if (service.roster.canUpdateStatus(switch (incident.status) {
              IncidentStatus.triggered => IncidentStatus.acknowledged,
              IncidentStatus.acknowledged => IncidentStatus.dispatched,
              _ => IncidentStatus.resolved,
            })) ...[
              const SizedBox(height: 12),
              SosAlertActions(
                quick: true,
                incident: incident,
                roster: service.roster,
                onUpdate: service.updateStatus,
              ),
            ],
          ],
        ),
      ),
    );
  }

  ButtonStyle _buttonStyle(BuildContext context) => OutlinedButton.styleFrom(
    minimumSize: const Size(48, 48),
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
    side: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
  );
}
