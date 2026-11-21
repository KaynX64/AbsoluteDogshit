import 'dart:async';

import 'package:flutter/material.dart';

import '../services/emergency_alert_service.dart';

class IncidentReportsScreen extends StatefulWidget {
  const IncidentReportsScreen({super.key, required this.service});

  final EmergencyAlertService service;

  @override
  State<IncidentReportsScreen> createState() => _IncidentReportsScreenState();
}

class _IncidentReportsScreenState extends State<IncidentReportsScreen>
    with WidgetsBindingObserver {
  List<({int id, DateTime? resolvedAt})>? _reports;
  bool _loading = false;
  bool _failed = false;
  bool _refreshAgain = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.service.incidentReportChanges.addListener(_refresh);
    unawaited(_refresh());
  }

  @override
  void dispose() {
    widget.service.incidentReportChanges.removeListener(_refresh);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(_refresh());
  }

  Future<void> _refresh() async {
    if (_loading) {
      _refreshAgain = true;
      return;
    }
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final reports = await widget.service.pendingIncidentReports();
      if (mounted) setState(() => _reports = reports);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) {
        setState(() => _loading = false);
        if (_refreshAgain) {
          _refreshAgain = false;
          unawaited(_refresh());
        }
      }
    }
  }

  Future<void> _open(int id) async {
    final filed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => _IncidentReportForm(id: id, service: widget.service),
      ),
    );
    if (!mounted || filed == null) return;
    setState(() => _reports?.removeWhere((report) => report.id == id));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          filed ? 'Incident report filed.' : 'This report was already filed.',
        ),
      ),
    );
    unawaited(_refresh());
  }

  @override
  Widget build(BuildContext context) {
    final reports = _reports ?? [];
    final formats = MaterialLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Pending incident reports')),
      body: ListenableBuilder(
        listenable: widget.service.roster,
        builder: (context, _) {
          if (!widget.service.roster.eligible) {
            return const Center(
              child: Text('Responder access is unavailable.'),
            );
          }
          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  'Resolved incidents pending a report from the last 24 hours.',
                ),
                if (_loading) const LinearProgressIndicator(),
                if (_failed)
                  ListTile(
                    title: const Text('Could not load pending reports.'),
                    trailing: TextButton(
                      onPressed: _refresh,
                      child: const Text('Retry'),
                    ),
                  ),
                if (!_loading && !_failed && reports.isEmpty)
                  const ListTile(title: Text('No pending reports.')),
                for (final report in reports)
                  ListTile(
                    title: Text('Incident #${report.id}'),
                    subtitle: report.resolvedAt == null
                        ? null
                        : Text(
                            '${formats.formatShortDate(report.resolvedAt!)} · ${formats.formatTimeOfDay(TimeOfDay.fromDateTime(report.resolvedAt!))}',
                          ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => _open(report.id),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _IncidentReportForm extends StatefulWidget {
  const _IncidentReportForm({required this.id, required this.service});

  final int id;
  final EmergencyAlertService service;

  @override
  State<_IncidentReportForm> createState() => _IncidentReportFormState();
}

class _IncidentReportFormState extends State<_IncidentReportForm> {
  final _form = GlobalKey<FormState>();
  final _details = TextEditingController();
  final _notes = TextEditingController();
  bool _submitting = false;
  bool _failed = false;

  @override
  void dispose() {
    _details.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_submitting || !_form.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _failed = false;
    });
    try {
      final filed = await widget.service.fileIncidentReport(
        widget.id,
        _details.text.trim(),
        _notes.text.trim(),
      );
      if (mounted) Navigator.pop(context, filed);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text('Incident #${widget.id} report')),
    body: ListenableBuilder(
      listenable: widget.service.roster,
      builder: (context, _) {
        if (!widget.service.roster.eligible) {
          _details.clear();
          _notes.clear();
          return const Center(child: Text('Responder access is unavailable.'));
        }
        return Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              TextFormField(
                controller: _details,
                readOnly: _submitting,
                maxLength: 4000,
                minLines: 3,
                maxLines: 8,
                decoration: const InputDecoration(
                  labelText: 'Incident details',
                ),
                validator: (value) => (value?.trim().length ?? 0) < 5
                    ? 'Enter at least 5 characters.'
                    : null,
              ),
              TextFormField(
                controller: _notes,
                readOnly: _submitting,
                maxLength: 4000,
                minLines: 2,
                maxLines: 8,
                decoration: const InputDecoration(
                  labelText: 'Treatment notes (optional)',
                ),
              ),
              if (_failed)
                const Text(
                  'Could not file the report. Your draft is still open. Try again.',
                ),
              if (_submitting) const LinearProgressIndicator(),
              FilledButton(
                onPressed: _submitting ? null : _submit,
                child: const Text('File report'),
              ),
            ],
          ),
        );
      },
    ),
  );
}
