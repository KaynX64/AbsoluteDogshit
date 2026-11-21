import 'dart:async';

import 'package:flutter/material.dart';

import '../models/responder_records.dart';
import '../services/emergency_alert_service.dart';
import 'responder_record_detail.dart';

class ResponderRecordsView extends StatefulWidget {
  const ResponderRecordsView({
    super.key,
    required this.service,
    this.history = false,
  });
  final EmergencyAlertService service;
  final bool history;
  @override
  State<ResponderRecordsView> createState() => _ResponderRecordsViewState();
}

class _ResponderRecordsViewState extends State<ResponderRecordsView>
    with WidgetsBindingObserver {
  final _search = TextEditingController();
  final _records = <ResponderRecord>[];
  Completer<void>? _abort;
  Timer? _debounce;
  String _tab = 'pending', _period = 'all', _outcome = 'all';
  DateTimeRange? _range;
  String? _cursor, _error;
  bool _loading = false, _eligible = false;

  @override
  void initState() {
    super.initState();
    _period = widget.history ? '30' : 'all';
    _eligible = widget.service.roster.canManageIncidents;
    WidgetsBinding.instance.addObserver(this);
    widget.service.incidentReportChanges.addListener(_refresh);
    widget.service.roster.addListener(_accessChanged);
    widget.service.reportSummary.addListener(_summaryChanged);
    unawaited(widget.service.refreshReportSummary());
    unawaited(_load());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    widget.service.incidentReportChanges.removeListener(_refresh);
    widget.service.roster.removeListener(_accessChanged);
    widget.service.reportSummary.removeListener(_summaryChanged);
    _debounce?.cancel();
    _cancel();
    _search.dispose();
    super.dispose();
  }

  void _cancel() {
    if (_abort?.isCompleted == false) _abort!.complete();
  }

  void _accessChanged() {
    final allowed = widget.service.roster.canManageIncidents;
    if (allowed == _eligible) return;
    _eligible = allowed;
    _cancel();
    if (!mounted) return;
    setState(() {
      _records.clear();
      _cursor = null;
    });
    if (allowed) _refresh();
  }

  void _summaryChanged() {
    if (!widget.history &&
        _tab == 'filed' &&
        widget.service.reportSummary.value?.canViewFiled != true) {
      setState(() {
        _tab = 'pending';
        _period = 'all';
      });
      _refresh();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refresh();
  }

  void _refresh() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 200), () {
      unawaited(_load());
      unawaited(widget.service.refreshReportSummary());
    });
  }

  String _date(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
  Future<void> _load({bool more = false}) async {
    _cancel();
    final abort = Completer<void>();
    _abort = abort;
    if (!widget.service.roster.canManageIncidents) return;
    setState(() {
      _loading = true;
      _error = null;
      if (!more) {
        _records.clear();
        _cursor = null;
      }
    });
    final query = <String, String>{
      'limit': '25',
      'search': _search.text.trim(),
      'period': _period,
      'status': _outcome,
      if (_range != null && _period == 'custom') 'from': _date(_range!.start),
      if (_range != null && _period == 'custom') 'to': _date(_range!.end),
      if (more && _cursor != null) 'before': _cursor!,
    };
    final path = widget.history
        ? '/history'
        : _tab == 'filed'
        ? '/reports'
        : '/report-worklist';
    try {
      final page = await widget.service.readResponderRecords(
        '$path?${Uri(queryParameters: query).query}',
        abortTrigger: abort.future,
      );
      if (!mounted || abort.isCompleted) return;
      final rows = page['records'];
      if (rows is! List) {
        throw StateError('Update the server to use responder history.');
      }
      setState(() {
        for (final data in rows.cast<Map<String, dynamic>>()) {
          final row = ResponderRecord(data);
          if (!_records.any((existing) => existing.id == row.id)) {
            _records.add(row);
          }
        }
        _cursor = page['nextCursor'] as String?;
      });
    } catch (error) {
      if (mounted && !abort.isCompleted) {
        setState(
          () => _error = error.toString().replaceFirst('Bad state: ', ''),
        );
      }
    } finally {
      if (mounted && !abort.isCompleted) setState(() => _loading = false);
    }
  }

  Future<void> _choosePeriod(String? value) async {
    if (value == null) return;
    if (value == 'custom') {
      final range = await showDateRangePicker(
        context: context,
        firstDate: DateTime(2000),
        lastDate: DateTime.now().add(const Duration(days: 1)),
        initialDateRange: _range,
      );
      if (!mounted || range == null) return;
      _range = range;
    }
    setState(() => _period = value);
    await _load();
  }

  String _stamp(ResponderRecord row, String key) {
    final at = row.date(key);
    if (at == null) return 'Not recorded';
    final format = MaterialLocalizations.of(context);
    return '${format.formatMediumDate(at)} · ${format.formatTimeOfDay(TimeOfDay.fromDateTime(at))}';
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: Listenable.merge([
      widget.service.roster,
      widget.service.reportSummary,
      widget.service.reportSummaryError,
    ]),
    builder: (context, _) {
      if (!widget.service.roster.canManageIncidents) {
        return const Center(
          child: Text('History and reports are restricted to response staff.'),
        );
      }
      final summary = widget.service.reportSummary.value;
      return RefreshIndicator(
        onRefresh: () async {
          await widget.service.refreshAccess();
          await _load();
          await widget.service.refreshReportSummary();
        },
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.history ? 'Alert history' : 'Incident reports',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    Text(
                      widget.history
                          ? 'Closed incidents and recorded activity'
                          : 'Read-only on mobile · complete reports on desktop',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    if (!widget.history && summary != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Wrap(
                          spacing: 8,
                          runSpacing: 4,
                          children: [
                            Chip(label: Text('${summary.pending} pending')),
                            Chip(
                              avatar: const Icon(Icons.schedule, size: 18),
                              label: Text('${summary.overdue} over 24 hours'),
                            ),
                          ],
                        ),
                      ),
                    if (widget.service.reportSummaryError.value
                        case final error?)
                      TextButton.icon(
                        onPressed: () => widget.service.refreshReportSummary(),
                        icon: const Icon(Icons.refresh),
                        label: Text(error),
                      ),
                    if (!widget.history)
                      Wrap(
                        spacing: 8,
                        children: [
                          ChoiceChip(
                            label: const Text('Pending'),
                            selected: _tab == 'pending',
                            onSelected: (_) {
                              setState(() {
                                _tab = 'pending';
                                _period = 'all';
                              });
                              unawaited(_load());
                            },
                          ),
                          if (summary?.canViewFiled == true)
                            ChoiceChip(
                              label: const Text('Filed'),
                              selected: _tab == 'filed',
                              onSelected: (_) {
                                setState(() {
                                  _tab = 'filed';
                                  _period = '30';
                                });
                                unawaited(_load());
                              },
                            ),
                        ],
                      ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _search,
                      decoration: InputDecoration(
                        labelText: 'Search records',
                        hintText: 'Incident, report, name, ID or location',
                        prefixIcon: const Icon(Icons.search),
                        suffixIcon: IconButton(
                          tooltip: 'Clear search',
                          icon: const Icon(Icons.clear),
                          onPressed: () {
                            _search.clear();
                            unawaited(_load());
                          },
                        ),
                      ),
                      onChanged: (_) {
                        _cancel();
                        _debounce?.cancel();
                        _debounce = Timer(
                          const Duration(milliseconds: 300),
                          () => unawaited(_load()),
                        );
                      },
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 12,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        DropdownButton<String>(
                          isExpanded: true,
                          value: _period,
                          items: const [
                            DropdownMenuItem(
                              value: 'all',
                              child: Text('All time'),
                            ),
                            DropdownMenuItem(
                              value: '30',
                              child: Text('Last 30 days'),
                            ),
                            DropdownMenuItem(
                              value: 'custom',
                              child: Text('Choose dates'),
                            ),
                          ],
                          onChanged: _choosePeriod,
                        ),
                        if (widget.history)
                          DropdownButton<String>(
                            isExpanded: true,
                            value: _outcome,
                            items: const [
                              DropdownMenuItem(
                                value: 'all',
                                child: Text('All outcomes'),
                              ),
                              DropdownMenuItem(
                                value: 'resolved',
                                child: Text('Resolved'),
                              ),
                              DropdownMenuItem(
                                value: 'false_alarm',
                                child: Text('False alarms'),
                              ),
                            ],
                            onChanged: (value) {
                              setState(() => _outcome = value!);
                              unawaited(_load());
                            },
                          ),
                        IconButton(
                          tooltip: 'Refresh records',
                          icon: const Icon(Icons.refresh),
                          onPressed: () {
                            _refresh();
                          },
                        ),
                      ],
                    ),
                    if (_period == 'custom' && _range != null)
                      Text(
                        '${_date(_range!.start)} to ${_date(_range!.end)} · Philippine dates',
                      ),
                  ],
                ),
              ),
            ),
            if (_loading)
              const SliverToBoxAdapter(child: LinearProgressIndicator()),
            SliverPadding(
              padding: const EdgeInsets.all(12),
              sliver: SliverList(
                delegate: SliverChildBuilderDelegate((context, index) {
                  if (index == _records.length) {
                    if (_error != null) {
                      return Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          children: [
                            Text(_error!, textAlign: TextAlign.center),
                            TextButton(
                              onPressed: () => _load(),
                              child: const Text('Retry'),
                            ),
                          ],
                        ),
                      );
                    }
                    if (_cursor != null) {
                      return TextButton(
                        onPressed: _loading ? null : () => _load(more: true),
                        child: const Text('Load more records'),
                      );
                    }
                    if (_records.isEmpty && !_loading) {
                      return Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          children: [
                            const Icon(Icons.fact_check_outlined, size: 40),
                            const SizedBox(height: 12),
                            Text(
                              _search.text.isNotEmpty
                                  ? 'No matching records. Try another search or date range.'
                                  : 'No records in this view.',
                              textAlign: TextAlign.center,
                            ),
                          ],
                        ),
                      );
                    }
                    return const SizedBox.shrink();
                  }
                  final row = _records[index];
                  return Card(
                    child: InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: () => Navigator.push(
                        context,
                        MaterialPageRoute<void>(
                          builder: (_) => ResponderRecordDetail(
                            service: widget.service,
                            record: row,
                            filed: !widget.history && _tab == 'filed',
                          ),
                        ),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Icon(
                                  row.pending
                                      ? Icons.assignment_late_outlined
                                      : Icons.history,
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    'SOS-${row.id}${row.reportId == null ? '' : ' · IR-${row.reportId}'}',
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleMedium,
                                  ),
                                ),
                                const Icon(Icons.chevron_right),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text(
                              row.name,
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            Text(row.identifier),
                            Text(row.location),
                            const SizedBox(height: 8),
                            Text(
                              _stamp(
                                row,
                                _tab == 'filed' && !widget.history
                                    ? 'filedAt'
                                    : 'resolvedAt',
                              ),
                            ),
                            Wrap(
                              spacing: 8,
                              runSpacing: 4,
                              children: [
                                Chip(label: Text(responderOutcome(row.status))),
                                if (row.needsAttention)
                                  const Chip(
                                    avatar: Icon(Icons.schedule, size: 18),
                                    label: Text('Over 24 hours'),
                                  ),
                              ],
                            ),
                            if (row.pending)
                              const Text(
                                'Complete this report in the desktop app.',
                              ),
                            if (row.hasDraft)
                              const Text('Draft saved on desktop'),
                            if (row.data['deferredAt'] != null)
                              Text(
                                'Last deferred ${_stamp(row, 'deferredAt')}',
                              ),
                          ],
                        ),
                      ),
                    ),
                  );
                }, childCount: _records.length + 1),
              ),
            ),
          ],
        ),
      );
    },
  );
}
