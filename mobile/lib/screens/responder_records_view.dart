import 'dart:async';

import 'package:flutter/material.dart';

import '../models/responder_records.dart';
import '../services/emergency_alert_service.dart';
import '../widgets/responder_record_card.dart';
import '../widgets/responder_record_filters.dart';
import '../widgets/responder_style.dart';
import 'responder_record_detail.dart';

class ResponderRecordsView extends StatefulWidget {
  const ResponderRecordsView({
    super.key,
    required this.service,
    this.history = false,
    this.active = true,
  });
  final EmergencyAlertService service;
  final bool history;
  final bool active;
  @override
  State<ResponderRecordsView> createState() => _ResponderRecordsViewState();
}

class _ResponderRecordsViewState extends State<ResponderRecordsView>
    with WidgetsBindingObserver {
  final _search = TextEditingController();
  final _records = <ResponderRecord>[];
  final _cache =
      <
        String,
        ({
          List<ResponderRecord> records,
          String? cursor,
          DateTime at,
          int revision,
        })
      >{};
  String? _loadedKey;
  int _revision = 0;
  bool _dirty = false;
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
    if (widget.service.reportSummary.value == null) {
      unawaited(widget.service.refreshReportSummary());
    }
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

  @override
  void didUpdateWidget(covariant ResponderRecordsView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!widget.active && oldWidget.active) {
      _dirty = _dirty || _loading;
      _debounce?.cancel();
      _cancel();
      _loading = false;
    }
    if (widget.active && !oldWidget.active) {
      unawaited(_load(force: _dirty));
      _dirty = false;
    }
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
      _cache.clear();
      _records.clear();
      _cursor = null;
    });
    if (allowed) _refresh();
  }

  void _summaryChanged() {
    if (widget.service.reportSummary.value?.canViewFiled != true) {
      _cache.removeWhere((key, _) => key.startsWith('/reports?'));
    }
    if (!widget.history &&
        _tab == 'filed' &&
        widget.service.reportSummary.value?.canViewFiled != true) {
      _cancel();
      setState(() {
        _records.clear();
        _loadedKey = null;
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
    _revision++;
    _cancel();
    if (!widget.active) {
      _dirty = true;
      return;
    }
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 200), () {
      unawaited(_load(force: true));
      unawaited(widget.service.refreshReportSummary());
    });
  }

  String _date(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
  Future<void> _load({bool more = false, bool force = false}) async {
    _debounce?.cancel();
    _cancel();
    final abort = Completer<void>();
    _abort = abort;
    if (!widget.service.roster.canManageIncidents) return;
    final query = <String, String>{
      'limit': '25',
      'search': _search.text.trim(),
      'period': _period,
      'status': _outcome,
      if (_range != null && _period == 'custom') 'from': _date(_range!.start),
      if (_range != null && _period == 'custom') 'to': _date(_range!.end),
    };
    final path = widget.history
        ? '/history'
        : _tab == 'filed'
        ? '/reports'
        : '/report-worklist';
    final key = '$path?${Uri(queryParameters: query).query}';
    final saved = _cache[key];
    final fresh =
        saved != null &&
        saved.revision == _revision &&
        DateTime.now().difference(saved.at) < const Duration(seconds: 15);
    setState(() {
      _error = null;
      if (!more && _loadedKey != key) {
        _records
          ..clear()
          ..addAll(saved?.records ?? []);
        _cursor = saved?.cursor;
      }
      _loadedKey = key;
      _loading = more || force || !fresh;
    });
    if (!more && !force && fresh) return;
    if (more && _cursor != null) query['before'] = _cursor!;
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
        if (!more) _records.clear();
        final ids = _records.map((row) => row.id).toSet();
        for (final data in rows.cast<Map<String, dynamic>>()) {
          final row = ResponderRecord(data);
          if (ids.add(row.id)) {
            _records.add(row);
          }
        }
        _cursor = page['nextCursor'] as String?;
        _cache.remove(key);
        _cache[key] = (
          records: List.of(_records),
          cursor: _cursor,
          at: DateTime.now(),
          revision: _revision,
        );
        if (_cache.length > 6) _cache.remove(_cache.keys.first);
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

  void _selectTab(String value) {
    if (_tab == value) return;
    setState(() {
      _tab = value;
      _period = value == 'filed' ? '30' : 'all';
    });
    unawaited(_load());
  }

  Future<void> _choosePeriod(String? value) async {
    if (value == null) return;
    if (value == _period && value != 'custom') return;
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
      final theme = Theme.of(context), colors = theme.colorScheme;
      final summary = widget.service.reportSummary.value;
      return RefreshIndicator(
        onRefresh: () async {
          await widget.service.refreshAccess();
          _revision++;
          await _load(force: true);
          await widget.service.refreshReportSummary();
        },
        child: CustomScrollView(
          key: PageStorageKey(
            widget.history ? 'responder-history' : 'responder-reports',
          ),
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                widget.history
                                    ? 'Alert history'
                                    : 'Incident reports',
                                style: theme.textTheme.headlineSmall,
                              ),
                              const SizedBox(height: 4),
                              Text(
                                widget.history
                                    ? 'Closed incidents and recorded activity'
                                    : 'Read-only on mobile · complete reports on desktop',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: colors.onSurfaceVariant,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton.filledTonal(
                          tooltip: 'Refresh records',
                          onPressed: _loading ? null : _refresh,
                          icon: const Icon(Icons.refresh_rounded, size: 22),
                        ),
                      ],
                    ),
                    if (!widget.history && summary != null) ...[
                      const SizedBox(height: 16),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          ResponderBadge(
                            label: '${summary.pending} pending',
                            icon: Icons.assignment_late_outlined,
                          ),
                          ResponderBadge(
                            label: '${summary.overdue} over 24 hours',
                            icon: Icons.schedule_rounded,
                            attention: true,
                          ),
                        ],
                      ),
                    ],
                    if (widget.service.reportSummaryError.value
                        case final error?)
                      TextButton.icon(
                        onPressed: () => widget.service.refreshReportSummary(),
                        icon: const Icon(Icons.refresh),
                        label: Text(error),
                      ),
                    if (!widget.history) ...[
                      const SizedBox(height: 16),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          _tabButton(
                            'pending',
                            'Pending',
                            Icons.pending_actions_rounded,
                          ),
                          if (summary?.canViewFiled == true)
                            _tabButton(
                              'filed',
                              'Filed',
                              Icons.task_alt_rounded,
                            ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 16),
                    ResponderRecordFilters(
                      search: _search,
                      period: _period,
                      outcome: _outcome,
                      history: widget.history,
                      onPeriod: (value) => unawaited(_choosePeriod(value)),
                      onOutcome: (value) {
                        if (value == _outcome) return;
                        setState(() => _outcome = value);
                        unawaited(_load());
                      },
                      onClear: () {
                        _search.clear();
                        unawaited(_load());
                      },
                      onSearch: (_) {
                        _cancel();
                        _debounce?.cancel();
                        _debounce = Timer(
                          const Duration(milliseconds: 300),
                          () => unawaited(_load()),
                        );
                      },
                    ),
                    if (_period == 'custom' && _range != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          '${_date(_range!.start)} to ${_date(_range!.end)} · Philippine dates',
                          style: theme.textTheme.bodySmall,
                        ),
                      ),
                    const SizedBox(height: 16),
                    SizedBox(
                      height: 2,
                      child: _loading
                          ? const LinearProgressIndicator(minHeight: 2)
                          : null,
                    ),
                  ],
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
              sliver: SliverList(
                delegate: SliverChildBuilderDelegate((context, index) {
                  if (index == _records.length) {
                    if (_error != null) {
                      return Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          children: [
                            const Icon(Icons.cloud_off_outlined),
                            const SizedBox(height: 8),
                            Text(_error!, textAlign: TextAlign.center),
                            TextButton.icon(
                              onPressed: () => _load(force: true),
                              icon: const Icon(Icons.refresh),
                              label: const Text('Retry'),
                            ),
                          ],
                        ),
                      );
                    }
                    if (_cursor != null) {
                      return TextButton.icon(
                        onPressed: _loading ? null : () => _load(more: true),
                        icon: const Icon(Icons.expand_more),
                        label: const Text('Load more records'),
                      );
                    }
                    if (_records.isEmpty && !_loading) {
                      return Padding(
                        padding: const EdgeInsets.symmetric(
                          vertical: 32,
                          horizontal: 16,
                        ),
                        child: Column(
                          children: [
                            Icon(
                              Icons.fact_check_outlined,
                              size: 40,
                              color: colors.primary,
                            ),
                            const SizedBox(height: 12),
                            Text(
                              _search.text.isNotEmpty
                                  ? 'No matching records. Try another search or date range.'
                                  : 'No records in this view.',
                              textAlign: TextAlign.center,
                              style: theme.textTheme.bodyMedium,
                            ),
                          ],
                        ),
                      );
                    }
                    return const SizedBox.shrink();
                  }
                  final row = _records[index];
                  return ResponderRecordCard(
                    key: ValueKey(row.id),
                    record: row,
                    time: _stamp(
                      row,
                      _tab == 'filed' && !widget.history
                          ? 'filedAt'
                          : 'resolvedAt',
                    ),
                    deferredTime: row.data['deferredAt'] == null
                        ? null
                        : _stamp(row, 'deferredAt'),
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute<void>(
                        builder: (_) => ResponderStyle(
                          child: ResponderRecordDetail(
                            service: widget.service,
                            record: row,
                            filed: !widget.history && _tab == 'filed',
                          ),
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

  Widget _tabButton(String value, String label, IconData icon) {
    final colors = Theme.of(context).colorScheme;
    final selected = _tab == value;
    return Semantics(
      selected: selected,
      child: OutlinedButton.icon(
        onPressed: () => _selectTab(value),
        icon: Icon(icon, size: 18),
        label: Text(label),
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(0, 48),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          backgroundColor: selected
              ? colors.primary
              : colors.surfaceContainerLowest,
          foregroundColor: selected ? colors.onPrimary : colors.onSurface,
          side: BorderSide(
            color: selected ? colors.primary : colors.outlineVariant,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    );
  }
}
