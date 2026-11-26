import 'dart:async';
import 'dart:io';

import 'package:material_ui/material_ui.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/responder_records.dart';
import '../services/emergency_alert_service.dart';

class ResponderRecordDetail extends StatefulWidget {
  const ResponderRecordDetail({
    super.key,
    required this.service,
    required this.record,
    this.filed = false,
  });
  final EmergencyAlertService service;
  final ResponderRecord record;
  final bool filed;
  @override
  State<ResponderRecordDetail> createState() => _ResponderRecordDetailState();
}

class _ResponderRecordDetailState extends State<ResponderRecordDetail> {
  final _abort = Completer<void>();
  late Future<Map<String, dynamic>> _details;
  bool _opening = false;
  String? _pdfError;
  @override
  void initState() {
    super.initState();
    _details = _load();
  }

  Future<Map<String, dynamic>> _load() async {
    final incident = await widget.service.readResponderRecords(
      '/history/${widget.record.id}',
      abortTrigger: _abort.future,
    );
    final report = widget.filed && widget.record.reportId != null
        ? await widget.service.readResponderRecords(
            '/reports/${widget.record.reportId}',
            abortTrigger: _abort.future,
          )
        : null;
    return {'incident': incident, 'report': report};
  }

  @override
  void dispose() {
    _abort.complete();
    super.dispose();
  }

  String _stamp(Object? value) {
    final at = DateTime.tryParse('$value')
        ?.toUtc()
        .add(const Duration(hours: 8));
    if (at == null) return 'Not recorded';
    final format = MaterialLocalizations.of(context);
    return '${format.formatMediumDate(at)} · ${format.formatTimeOfDay(TimeOfDay.fromDateTime(at))}';
  }

  Future<void> _pdf() async {
    if (_opening || widget.record.reportId == null) return;
    setState(() {
      _opening = true;
      _pdfError = null;
    });
    File? file;
    try {
      final directory = await getTemporaryDirectory();
      file = File(
        '${directory.path}/incident-report-${widget.record.reportId}-${DateTime.now().microsecondsSinceEpoch}.pdf',
      );
      await widget.service.downloadReportPdf(widget.record.reportId!, file);
      if (!mounted) {
        if (await file.exists()) await file.delete();
        return;
      }
      final result = await OpenFilex.open(file.path);
      if (result.type != ResultType.done) throw StateError(result.message);
    } catch (error) {
      if (mounted) {
        setState(
          () => _pdfError = error.toString().replaceFirst('Bad state: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text('SOS-${widget.record.id}')),
    body: ListenableBuilder(
      listenable: Listenable.merge([
        widget.service.roster,
        widget.service.reportSummary,
      ]),
      builder: (context, _) {
        if (!widget.service.roster.canManageIncidents ||
            (widget.filed &&
                widget.service.reportSummary.value?.canViewFiled != true)) {
          return const Center(
            child: Text('You no longer have access to these records.'),
          );
        }
        return FutureBuilder<Map<String, dynamic>>(
          future: _details,
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        snapshot.error.toString(),
                        textAlign: TextAlign.center,
                      ),
                      TextButton(
                        onPressed: () => setState(() => _details = _load()),
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                ),
              );
            }
            if (!snapshot.hasData) {
              return const Center(child: CircularProgressIndicator());
            }
            final detail = ResponderRecord(
              snapshot.data!['incident'] as Map<String, dynamic>,
            );
            final report = snapshot.data!['report'] as Map<String, dynamic>?;
            final events = detail.data['timeline'] as List? ?? [];
            return ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Text(
                  detail.name,
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                Text(detail.identifier),
                Wrap(
                  spacing: 8,
                  children: [
                    Chip(label: Text(responderOutcome(detail.status))),
                    if (detail.needsAttention)
                      const Chip(label: Text('Over 24 hours')),
                  ],
                ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.place_outlined),
                  title: const Text('Reported location'),
                  subtitle: Text(detail.location),
                ),
                if (detail.data['latitude'] != null &&
                    detail.data['longitude'] != null)
                  OutlinedButton.icon(
                    icon: const Icon(Icons.map_outlined),
                    label: const Text('Open reported location'),
                    onPressed: () async {
                      try {
                        final opened = await launchUrl(
                          Uri.https('www.google.com', '/maps/search/', {
                            'api': '1',
                            'query':
                                '${detail.data['latitude']},${detail.data['longitude']}',
                          }),
                          mode: LaunchMode.externalApplication,
                        );
                        if (!opened) throw StateError('Maps unavailable');
                      } catch (_) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Could not open Maps.'),
                            ),
                          );
                        }
                      }
                    },
                  ),
                Text(
                  'Recorded activity',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                for (final event in events.cast<Map>())
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.radio_button_checked, size: 18),
                    title: Text(responderOutcome('${event['status']}')),
                    subtitle: Text(
                      '${_stamp(event['at'])}${event['actor'] == null ? '' : '\n${event['actor']}'}',
                    ),
                  ),
                if (detail.pending)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Icons.desktop_windows_outlined),
                          const SizedBox(height: 8),
                          Text(
                            'Report pending',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const Text(
                            'Complete this report in the desktop app.',
                          ),
                          if (detail.hasDraft)
                            const Text('Draft saved on desktop'),
                          if (detail.data['deferredAt'] != null)
                            Text(
                              'Last deferred ${_stamp(detail.data['deferredAt'])}',
                            ),
                        ],
                      ),
                    ),
                  ),
                if (report != null) ...[
                  const Divider(height: 32),
                  Text(
                    'Filed report · read-only',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  Text(
                    '${report['documentedByName']} · ${_stamp(report['filedAt'])}',
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Incident details',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  SelectableText('${report['incidentDetails']}'),
                  const SizedBox(height: 16),
                  Text(
                    'Treatment / handover notes',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  SelectableText(
                    report['treatmentNotes'] as String? ??
                        'No additional notes recorded.',
                  ),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed: _opening ? null : _pdf,
                    icon: const Icon(Icons.picture_as_pdf_outlined),
                    label: Text(
                      _opening ? 'Opening PDF…' : 'Open / download PDF',
                    ),
                  ),
                  if (_pdfError != null)
                    Text(
                      _pdfError!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                ],
              ],
            );
          },
        );
      },
    ),
  );
}
