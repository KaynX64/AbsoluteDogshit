# MB-09 · ResponderRecordsView

[Mobile slice index](../CODESLICE.md)

## MB-09 · mobile/lib/screens/responder_records_view.dart
**LOC:** 496 · **Anchor commit:** working tree

Mounted by ResponderWorkspace and IncidentReportsScreen. Uses GET-only history/report APIs and shared counts. ResponderRecordDetail loads timeline, report narrative and PDF on demand. [Workflow](../../../../server/RESPONDER-RECORDS.md).

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-32 | `class ResponderRecordsView` | Imports and read-only history/report state |
| 2 | 33-100 | `void initState()` | Lifecycle, access/report listeners and cancellation |
| 3 | 101-157 | `Future<void> _load(` | Paged GET reads, filters, stale-response guards and deduplication |
| 4 | 158-181 | `Future<void> _choosePeriod(` | Philippine date filter and formatting helpers |
| 5 | 182-362 | `Widget build(` | Staff gate and scrollable header, tabs, search and filters |
| 6 | 363-496 | `SliverPadding(` | Lazy cards, read-only details, attention/draft metadata and pagination |
