import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/emergency_alert_service.dart';
import '../services/responder_roster.dart';
import '../screens/incident_reports_screen.dart';
import 'sos_alert_actions.dart';
import 'responder_workspace.dart';

class ActiveIncidentBanner extends StatelessWidget {
  const ActiveIncidentBanner({super.key, this.service});
  final EmergencyAlertService? service;

  @override
  Widget build(BuildContext context) {
    final service = this.service ?? EmergencyAlertService();
    return ListenableBuilder(
      listenable: service.roster,
      builder: (context, _) {
        final roster = service.roster;
        if (!roster.eligible) return const SizedBox.shrink();
        final incidents = roster.incidents;
        final alert = incidents.firstOrNull;
        if (alert == null || roster.mode == ResponderDutyMode.offDuty) {
          return const SizedBox.shrink();
        }
        final scheme = Theme.of(context).colorScheme;
        return Material(
          color: scheme.errorContainer,
          child: ListTile(
            textColor: scheme.onErrorContainer,
            iconColor: scheme.onErrorContainer,
            leading: const Icon(Icons.emergency_outlined),
            title: Text(
              incidents.length == 1
                  ? 'Active campus incident'
                  : '${incidents.length} active campus incidents',
            ),
            subtitle: Text(
              alert.reportedLocation,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            onTap: () =>
                showResponderIncident(context, alert.id, service: service),
            trailing: _MuteButton(service: service, incident: alert),
          ),
        );
      },
    );
  }
}

class ResponderHubButton extends StatelessWidget {
  const ResponderHubButton({super.key});

  @override
  Widget build(BuildContext context) {
    final roster = EmergencyAlertService().roster;
    return ListenableBuilder(
      listenable: roster,
      builder: (context, _) {
        if (!roster.eligible) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.only(top: 8),
          child: TextButton.icon(
            style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (context) => Scaffold(
                  appBar: AppBar(title: const Text('Responder Hub')),
                  body: const ResponderWorkspace(),
                ),
              ),
            ),
            icon: const Icon(Icons.health_and_safety_outlined),
            label: Text('Responder Hub · ${roster.mode.label}'),
          ),
        );
      },
    );
  }
}

class ResponderHub extends StatelessWidget {
  const ResponderHub({super.key, this.service});
  final EmergencyAlertService? service;

  @override
  Widget build(BuildContext context) {
    final service = this.service ?? EmergencyAlertService();
    return ListenableBuilder(
      listenable: Listenable.merge([service.roster, service.delivery]),
      builder: (context, _) {
        final roster = service.roster;
        if (!roster.eligible) {
          return Center(
            child: TextButton(
              onPressed: () => service.recover(),
              child: const Text('Check responder access'),
            ),
          );
        }
        final android =
            !kIsWeb && defaultTargetPlatform == TargetPlatform.android;
        final incidents = roster.incidents;
        return RefreshIndicator(
          onRefresh: () async {
            if (await service.refreshAccess()) {
              await service.refreshIncidents(manual: true);
            }
          },
          child: ListView.builder(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            itemCount: incidents.length + 1,
            itemBuilder: (context, index) {
              if (index > 0) {
                final incident = incidents[index - 1];
                return Card(
                  child: ListTile(
                    leading: const Icon(Icons.location_on_outlined),
                    title: Text(incident.reportedLocation),
                    subtitle: Text(
                      '${incident.status.label} · ${incident.patientName}',
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => showResponderIncident(
                      context,
                      incident.id,
                      service: service,
                    ),
                  ),
                );
              }
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (android) ...[
                    DropdownButtonFormField<ResponderDutyMode>(
                      decoration: const InputDecoration(labelText: 'Duty mode'),
                      initialValue: roster.mode,
                      isExpanded: true,
                      items: ResponderDutyMode.values
                          .map(
                            (mode) => DropdownMenuItem(
                              value: mode,
                              child: Text(mode.label),
                            ),
                          )
                          .toList(),
                      onChanged: (mode) {
                        if (mode != null) unawaited(service.setDutyMode(mode));
                      },
                    ),
                    const SizedBox(height: 8),
                    Semantics(
                      liveRegion: true,
                      child: Text(switch (service.delivery.value) {
                        DeliveryStatus.pending =>
                          'Updating background SOS delivery…',
                        DeliveryStatus.saved =>
                          'Background SOS delivery settings saved.',
                        DeliveryStatus.failed =>
                          'Background SOS delivery could not be updated.',
                      }),
                    ),
                    if (service.delivery.value == DeliveryStatus.failed)
                      TextButton(
                        onPressed: service.retryDelivery,
                        child: const Text('Retry delivery settings'),
                      ),
                  ],
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed:
                        incidents.any(
                          (incident) =>
                              incident.status == IncidentStatus.triggered,
                        )
                        ? null
                        : service.testSiren,
                    icon: const Icon(Icons.volume_up_outlined),
                    label: const Text('Test siren for 3 seconds'),
                  ),
                  if (roster.canManageIncidents) ...[
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) =>
                              IncidentReportsScreen(service: service),
                        ),
                      ),
                      icon: const Icon(Icons.assignment_outlined),
                      label: const Text('Pending incident reports'),
                    ),
                  ],
                  Text(
                    'Active incidents',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  TextButton.icon(
                    onPressed: roster.loading
                        ? null
                        : () async {
                            if (await service.refreshAccess()) {
                              await service.refreshIncidents(manual: true);
                            }
                          },
                    icon: const Icon(Icons.refresh),
                    label: const Text('Refresh incidents'),
                  ),
                  if (roster.loading) const LinearProgressIndicator(),
                  if (roster.failed)
                    const Text('Could not refresh incidents. Try again.'),
                  if (incidents.isEmpty && !roster.loading && !roster.failed)
                    Text(
                      roster.mode == ResponderDutyMode.offDuty
                          ? 'Refresh to check for active incidents.'
                          : 'No active incidents.',
                    ),
                ],
              );
            },
          ),
        );
      },
    );
  }
}

Future<void> showResponderIncident(
  BuildContext context,
  int id, {
  EmergencyAlertService? service,
}) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  showDragHandle: true,
  builder: (_) => FractionallySizedBox(
    heightFactor: 0.9,
    child: ResponderIncidentDetail(
      id: id,
      service: service ?? EmergencyAlertService(),
    ),
  ),
);

class ResponderIncidentDetail extends StatefulWidget {
  const ResponderIncidentDetail({
    super.key,
    required this.id,
    required this.service,
  });

  final int id;
  final EmergencyAlertService service;

  @override
  State<ResponderIncidentDetail> createState() =>
      _ResponderIncidentDetailState();
}

class _ResponderIncidentDetailState extends State<ResponderIncidentDetail> {
  Future<double?>? _distance;

  Future<double?> _measure(Incident incident) async {
    final lat = incident.latitude, lng = incident.longitude;
    if (lat == null || lng == null) return null;
    try {
      final permission = await Geolocator.checkPermission();
      if (permission != LocationPermission.always &&
          permission != LocationPermission.whileInUse) {
        return null;
      }
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
          timeLimit: Duration(seconds: 3),
        ),
      );
      return Geolocator.distanceBetween(
        position.latitude,
        position.longitude,
        lat,
        lng,
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> _maps(Incident incident) async {
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
      // Surface the failure while retaining the incident and coordinates.
    }
    if (mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Could not open Maps.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final service = widget.service;
    return ListenableBuilder(
      listenable: service.roster,
      builder: (context, _) {
        final incident = service.roster[widget.id];
        final theme = Theme.of(context);
        if (incident == null) {
          _distance = null;
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: Text(
                'Incident unavailable. It may have closed or your responder access may have changed.',
              ),
            ),
          );
        }
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Campus incident',
                      style: theme.textTheme.titleLarge,
                    ),
                  ),
                  _MuteButton(service: service, incident: incident),
                  IconButton(
                    tooltip: 'Close incident details',
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                children: [
                  Text('Reported location', style: theme.textTheme.labelLarge),
                  Text(
                    incident.reportedLocation,
                    style: theme.textTheme.headlineSmall,
                  ),
                  FutureBuilder<double?>(
                    future: _distance ??= _measure(incident),
                    builder: (context, snapshot) {
                      final meters = snapshot.data;
                      if (meters == null) return const SizedBox.shrink();
                      return Text(
                        meters < 1000
                            ? 'About ${meters.round()} m away in a straight line'
                            : 'About ${(meters / 1000).toStringAsFixed(1)} km away in a straight line',
                      );
                    },
                  ),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                    ),
                    onPressed: incident.latitude == null
                        ? null
                        : () => _maps(incident),
                    icon: const Icon(Icons.directions_outlined),
                    label: const Text('Navigate to scene'),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    incident.status.label,
                    style: theme.textTheme.labelLarge,
                  ),
                  Text(incident.patientName, style: theme.textTheme.titleLarge),
                  Text(
                    [
                      incident.roleLabel,
                      incident.identifier,
                      incident.phone,
                    ].nonNulls.join(' · '),
                  ),
                  if (incident.medicalDetailsRedacted)
                    const Text(
                      'Medical details are restricted for this responder account.',
                    )
                  else ...[
                    if (incident.bloodType case final blood?)
                      Text('Blood type: $blood'),
                    if (incident.allergies case final allergies?)
                      Text('Allergies: $allergies'),
                  ],
                  const SizedBox(height: 16),
                  SosAlertActions(
                    incident: incident,
                    roster: widget.service.roster,
                    onUpdate: service.updateStatus,
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _MuteButton extends StatelessWidget {
  const _MuteButton({required this.service, required this.incident});

  final EmergencyAlertService service;
  final Incident incident;

  @override
  Widget build(BuildContext context) {
    final muted = service.roster.isMuted(incident.id);
    return IconButton(
      tooltip: muted ? 'Unmute incident siren' : 'Mute incident siren',
      onPressed: incident.status == IncidentStatus.triggered
          ? () => service.roster.toggleMute(incident.id)
          : null,
      icon: Icon(muted ? Icons.volume_off_outlined : Icons.volume_up_outlined),
    );
  }
}
