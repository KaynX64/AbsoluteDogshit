import 'package:flutter/material.dart';

import '../services/responder_roster.dart';

class SosAlertActions extends StatefulWidget {
  const SosAlertActions({
    super.key,
    required this.incident,
    required this.onUpdate,
  });

  final Incident incident;
  final Future<String?> Function(int id, IncidentStatus status) onUpdate;

  @override
  State<SosAlertActions> createState() => _SosAlertActionsState();
}

class _SosAlertActionsState extends State<SosAlertActions> {
  bool _busy = false;
  bool _submitting = false;
  String? _error;

  Future<void> _run(IncidentStatus status) async {
    if (_busy) return;
    final id = widget.incident.id;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (status.isClosed) {
        final resolve = status == IncidentStatus.resolved;
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: Text(
              resolve
                  ? 'Resolve this emergency?'
                  : 'Mark this as a false alarm?',
            ),
            content: const Text(
              'Closing the incident ends the active alert for all responders.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: Text(
                  resolve ? 'Resolve incident' : 'Confirm false alarm',
                ),
              ),
            ],
          ),
        );
        if (confirmed != true || !mounted) return;
      }
      setState(() => _submitting = true);
      final error = await widget.onUpdate(id, status);
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _submitting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = widget.incident.status;
    const target = Size.fromHeight(48);
    final secondaryStyle = TextButton.styleFrom(minimumSize: const Size(48, 48));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 12,
      children: [
        if (status == IncidentStatus.triggered)
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: target),
            onPressed: _busy ? null : () => _run(IncidentStatus.acknowledged),
            child: const Text('Acknowledge'),
          ),
        if (status.index < IncidentStatus.dispatched.index)
          OutlinedButton(
            style: OutlinedButton.styleFrom(minimumSize: target),
            onPressed: _busy ? null : () => _run(IncidentStatus.dispatched),
            child: const Text('Dispatch to location'),
          ),
        if (!status.isClosed)
          Wrap(
            spacing: 12,
            runSpacing: 8,
            children: [
              TextButton(
                style: secondaryStyle,
                onPressed: _busy ? null : () => _run(IncidentStatus.resolved),
                child: const Text('Resolve'),
              ),
              TextButton(
                style: secondaryStyle,
                onPressed: _busy ? null : () => _run(IncidentStatus.falseAlarm),
                child: const Text('False alarm'),
              ),
            ],
          ),
        if (_submitting) const LinearProgressIndicator(),
        if (_error case final error?)
          Semantics(
            liveRegion: true,
            child: Text(
              error,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
      ],
    );
  }
}
