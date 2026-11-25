import 'dart:async';
import 'dart:io';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import '../services/emergency_alert_service.dart';
import '../services/mobile_session_data.dart';
import '../services/responder_qualification_service.dart';

class ResponderQualificationScreen extends StatefulWidget {
  const ResponderQualificationScreen({super.key, this.client, this.token});
  final http.Client? client;
  final String? token;
  @override
  State<ResponderQualificationScreen> createState() =>
      _ResponderQualificationScreenState();
}

class _ResponderQualificationScreenState
    extends State<ResponderQualificationScreen>
    with WidgetsBindingObserver {
  final _affiliation = TextEditingController(),
      _training = TextEditingController();
  final _temporaryFiles = <File>[];
  final _session = MobileSessionData.instance.generation;
  ResponderQualificationService? _service;
  Map<String, dynamic>? _overview, _detail;
  bool _busy = false, _accepted = false;
  String _level = 'community', _message = '';
  int _selection = 0;
  bool get _current =>
      mounted && _session == MobileSessionData.instance.generation;
  bool get _editable =>
      _detail != null &&
      [
        'draft',
        'needs_information',
        'training_required',
      ].contains(_detail!['status']);
  bool _isOpen(dynamic row) => [
    'draft',
    'submitted',
    'under_review',
    'needs_information',
    'training_required',
  ].contains(row['status']);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_initialize());
  }

  Future<void> _initialize() async {
    final token =
        widget.token ??
        await const FlutterSecureStorage().read(key: 'jwt_token');
    if (!_current) return;
    if (token == null) {
      setState(() => _message = 'Sign in again to view qualifications.');
      return;
    }
    _service = ResponderQualificationService(
      token: token,
      client: widget.client,
    );
    await _run(_load);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _selection++;
    _affiliation.dispose();
    _training.dispose();
    for (final file in _temporaryFiles) {
      unawaited(file.delete().catchError((_) => file));
    }
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _service != null && !_busy) {
      unawaited(_run(_load));
    }
  }

  Future<void> _load() async {
    final data = await _service!.request('/me');
    if (_current) setState(() => _overview = Map<String, dynamic>.from(data));
  }

  Future<void> _select(int id) async {
    final selection = ++_selection;
    final data = await _service!.request('/applications/$id');
    if (!_current || selection != _selection) return;
    setState(() {
      _detail = Map<String, dynamic>.from(data);
      _affiliation.text = _detail!['form']['affiliation'] ?? '';
      _training.text = _detail!['form']['trainingHistory'] ?? '';
      _level = _detail!['requested_level'];
      _accepted = _detail!['responsibilities_accepted_at'] != null;
    });
  }

  Future<void> _run(Future<void> Function() work, {String success = ''}) async {
    if (_busy || !_current) return;
    setState(() {
      _busy = true;
      _message = '';
    });
    try {
      await work();
      if (_current && success.isNotEmpty) setState(() => _message = success);
    } catch (error) {
      if (_current) {
        setState(
          () => _message = error.toString().replaceFirst('Exception: ', ''),
        );
      }
    } finally {
      if (_current) setState(() => _busy = false);
    }
  }

  Future<void> _action(String action) => _run(() async {
    final id = _detail!['application_id'] as int;
    await _service!.request(
      '/applications/$id',
      method: 'PATCH',
      body: {
        'action': action,
        'revision': _detail!['revision'],
        'requestedLevel': _level,
        'affiliation': _affiliation.text,
        'trainingHistory': _training.text,
        'acceptResponsibilities': _accepted,
      },
    );
    if (!_current) return;
    await _load();
    await _select(id);
    await EmergencyAlertService().refreshAccess();
  }, success: 'Application updated.');
  Future<void> _create() => _run(() async {
    final row = await _service!.request(
      '/applications',
      method: 'POST',
      body: {
        'requestedLevel': 'community',
        'affiliation': '',
        'trainingHistory': '',
      },
    );
    if (!_current) return;
    await _load();
    await _select(row['applicationId'] as int);
  });
  Future<void> _attach() => _run(() async {
    final file = await openFile(
      acceptedTypeGroups: [
        const XTypeGroup(
          label: 'Evidence',
          extensions: ['pdf', 'jpg', 'jpeg', 'png'],
          uniformTypeIdentifiers: [
            'com.adobe.pdf',
            'public.jpeg',
            'public.png',
          ],
        ),
      ],
    );
    if (file == null || !_current) return;
    if (await file.length() > 5 * 1024 * 1024) {
      throw Exception('Evidence must be no larger than 5 MB.');
    }
    final suffix = file.name.split('.').last.toLowerCase();
    final mime = suffix == 'pdf'
        ? 'application/pdf'
        : suffix == 'png'
        ? 'image/png'
        : 'image/jpeg';
    final id = _detail!['application_id'] as int;
    await _service!.upload(id, file.name, await file.readAsBytes(), mime);
    if (_current) await _select(id);
  }, success: 'Evidence attached.');
  Future<void> _openEvidence(dynamic evidence) => _run(() async {
    final bytes = await _service!.evidence(evidence['evidence_id'] as int);
    if (!mounted || !_current) return;
    if (evidence['mime_type'] != 'application/pdf') {
      await showDialog<void>(
        context: context,
        builder: (context) => Dialog(
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Image.memory(bytes),
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Close'),
                ),
              ],
            ),
          ),
        ),
      );
    } else {
      final directory = await getTemporaryDirectory();
      if (!_current) return;
      final file = File(
        '${directory.path}/qualification-${_overview!['actor']['userId']}-${evidence['evidence_id']}.pdf',
      );
      _temporaryFiles.add(file);
      await file.writeAsBytes(bytes, flush: true);
      if (_current) await OpenFilex.open(file.path);
    }
  });
  String _label(dynamic value) =>
      (value?.toString() ?? '').replaceAll('_', ' ');
  String _date(dynamic value) {
    final date = DateTime.tryParse(value?.toString() ?? '');
    return date == null
        ? '—'
        : MaterialLocalizations.of(context).formatCompactDate(date.toLocal());
  }

  Widget _card(List<Widget> children) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: children,
      ),
    ),
  );
  @override
  Widget build(BuildContext context) {
    final applications = (_overview?['applications'] as List?) ?? [];
    final access = _overview?['access'] as Map?;
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Responder qualification'),
        actions: [
          IconButton(
            tooltip: 'Refresh qualification',
            onPressed: _busy || _service == null
                ? null
                : () => _run(() async {
                    await _load();
                    if (_detail != null) {
                      await _select(_detail!['application_id']);
                    }
                  }),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            if (_busy) const LinearProgressIndicator(),
            if (_message.isNotEmpty)
              Padding(
                padding: const EdgeInsets.all(12),
                child: Text(_message, semanticsLabel: _message),
              ),
            if (_overview == null && !_busy)
              TextButton(onPressed: _initialize, child: const Text('Retry')),
            if (_overview != null) ...[
              _card([
                Text(
                  access?['authorized'] == true
                      ? 'Qualified Responder'
                      : 'No active responder appointment',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                Text('Valid until ${_date(access?['expiresAt'])}'),
                const SizedBox(height: 8),
                const Text(
                  'Approval records university authorization for campus duties. External first aid certificates are optional; the clinic can assess your competency.',
                ),
              ]),
              if (!applications.any(_isOpen))
                FilledButton.icon(
                  onPressed: _busy ? null : _create,
                  icon: const Icon(Icons.add),
                  label: Text(
                    (_overview!['appointments'] as List).isEmpty
                        ? 'Apply to respond'
                        : 'Request renewal',
                  ),
                ),
              for (final row in applications)
                Card(
                  child: ListTile(
                    selected:
                        _detail?['application_id'] == row['application_id'],
                    title: Text(
                      'Application #${row['application_id']} · ${_label(row['status'])}',
                    ),
                    subtitle: Text(
                      '${_label(row['application_type'])} · ${_date(row['created_at'])}',
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: _busy
                        ? null
                        : () =>
                              _run(() => _select(row['application_id'] as int)),
                  ),
                ),
              if (_detail != null)
                _card([
                  Text(
                    'Application #${_detail!['application_id']}',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  Text(
                    _label(_detail!['status']),
                    style: TextStyle(
                      color: scheme.primary,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  if (_detail!['fixture_key'] != null)
                    const Text('Synthetic demo data'),
                  if (_detail!['decision_reason'] != null)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Text(
                        'Clinic feedback: ${_detail!['decision_reason']}',
                      ),
                    ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: _level,
                    decoration: const InputDecoration(
                      labelText: 'Requested responder level',
                    ),
                    isExpanded: true,
                    items: const [
                      DropdownMenuItem(
                        value: 'community',
                        child: Text('Community responder'),
                      ),
                      DropdownMenuItem(
                        value: 'staff',
                        child: Text('Response staff'),
                      ),
                    ],
                    onChanged: _editable && !_busy
                        ? (value) => setState(() => _level = value!)
                        : null,
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _affiliation,
                    enabled: _editable && !_busy,
                    maxLength: 200,
                    decoration: const InputDecoration(
                      labelText: 'Campus affiliation',
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _training,
                    enabled: _editable && !_busy,
                    maxLength: 4000,
                    minLines: 3,
                    maxLines: 6,
                    decoration: const InputDecoration(
                      labelText:
                          'Training history or requested campus assessment',
                      alignLabelWithHint: true,
                    ),
                  ),
                  if (_editable) ...[
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      value: _accepted,
                      onChanged: _busy
                          ? null
                          : (value) => setState(() => _accepted = value!),
                      title: const Text(
                        'I accept campus responder responsibilities, escalation rules and privacy requirements.',
                      ),
                    ),
                    if (_detail!['source'] == 'nomination' &&
                        _detail!['nomination_accepted_at'] == null)
                      OutlinedButton(
                        onPressed: _busy || !_accepted
                            ? null
                            : () => _action('accept_nomination'),
                        child: const Text('Accept nomination'),
                      ),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        OutlinedButton(
                          onPressed: _busy ? null : () => _action('save'),
                          child: const Text('Save draft'),
                        ),
                        FilledButton(
                          onPressed: _busy || !_accepted
                              ? null
                              : () => _action('submit'),
                          child: const Text('Submit for clinic review'),
                        ),
                      ],
                    ),
                  ],
                  if (_isOpen(_detail))
                    TextButton(
                      onPressed: _busy
                          ? null
                          : () async {
                              final yes = await showDialog<bool>(
                                context: context,
                                builder: (context) => AlertDialog(
                                  title: const Text('Withdraw application?'),
                                  content: const Text(
                                    'Your existing valid appointment remains unchanged.',
                                  ),
                                  actions: [
                                    TextButton(
                                      onPressed: () =>
                                          Navigator.pop(context, false),
                                      child: const Text('Cancel'),
                                    ),
                                    TextButton(
                                      onPressed: () =>
                                          Navigator.pop(context, true),
                                      child: const Text('Withdraw'),
                                    ),
                                  ],
                                ),
                              );
                              if (yes == true && _current) {
                                await _action('withdraw');
                              }
                            },
                      child: const Text('Withdraw application'),
                    ),
                  const Divider(),
                  Text(
                    'Evidence',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  for (final evidence in _detail!['evidence'] as List)
                    TextButton.icon(
                      onPressed: _busy ? null : () => _openEvidence(evidence),
                      icon: const Icon(Icons.description_outlined),
                      label: Text(evidence['file_name']),
                    ),
                  if (_editable)
                    OutlinedButton.icon(
                      onPressed: _busy ? null : _attach,
                      icon: const Icon(Icons.attach_file),
                      label: const Text('Attach PDF or image · up to 5 MB'),
                    ),
                  if (_detail!['assessment'] != null)
                    ExpansionTile(
                      title: const Text('Clinic assessment'),
                      children: [
                        Padding(
                          padding: const EdgeInsets.all(12),
                          child: Text(
                            'Result: ${_detail!['assessment']['result']}\nAssessor: ${_detail!['assessment']['assessor'] ?? 'Pending'}\n${_detail!['assessment']['notes'] ?? ''}',
                          ),
                        ),
                      ],
                    ),
                  const Divider(),
                  Text(
                    'Application history',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  for (final entry in _detail!['events'] as List)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(_label(entry['action']).toLowerCase()),
                      subtitle: Text(
                        '${entry['actor_name'] ?? 'System'} · ${_date(entry['created_at'])}\n${entry['details']['reason'] ?? ''}',
                      ),
                    ),
                ]),
              if ((_overview!['notices'] as List).isNotEmpty)
                _card([
                  Text(
                    'Notifications',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  for (final notice in _overview!['notices'] as List)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(notice['message']),
                      subtitle: Text(_date(notice['created_at'])),
                    ),
                ]),
            ],
          ],
        ),
      ),
    );
  }
}
