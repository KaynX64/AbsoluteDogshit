# MB-09 - ResponderRecordsView

[Mobile slice index](../CODESLICE.md)

## MB-09 · mobile/lib/screens/responder_records_view.dart
**LOC:** 532 - **Anchor commit:** working tree

Mounted by ResponderWorkspace and IncidentReportsScreen. GET-only history/report APIs and bounded memory snapshots. Shared ResponderStyle, ResponderRecordFilters and ResponderRecordCard own presentation. ResponderRecordDetail loads timeline, narrative and PDF on demand. [Workflow](../../../../server/RESPONDER-RECORDS.md).

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-50 | `class ResponderRecordsView` | material_ui imports, read-only record state and bounded view cache |
| 2 | 51-148 | `void initState()` | Lifecycle, visible-destination refresh, permissions and cancellation |
| 3 | 149-235 | `Future<void> _load(` | Paged GET reads, cached snapshots, filters and stale-response guards |
| 4 | 236-260 | `Future<void> _choosePeriod(` | Philippine date filter and formatting helpers |
| 5 | 261-414 | `Widget build(` | Staff gate, themed header, report tabs and shared search/filter controls |
| 6 | 415-505 | `SliverPadding(` | Lazy shared cards, read-only details, loading/error/empty states and pagination |
| 7 | 506-532 | `Widget _tabButton(` | Accessible icon report-tab buttons |
