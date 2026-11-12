# DT-06 · AnalyticsDashboard.tsx

[Desktop slice index](../CODESLICE.md)

## DT-06 · desktop/src/components/AnalyticsDashboard.tsx
**LOC:** 180 · **Role:** Desktop analytics dashboard, shared by Doctor, Dentist and authorized Admin consoles.
**API surface:** GET /api/analytics/summary; GET /api/analytics/export/excel; GET /api/analytics/export/pdf.
**Feature modules:** `analytics/Sections.tsx` owns the four section panels and diagnosis explorer. `analytics/Charts.tsx` owns shared charts and exact-value tables. `analytics/data.ts` owns the response types and formatting. `analytics/dashboard.css` scopes dashboard and print styles.

| # | Lines | Anchor | Description |
|---|---|---|---|
| 1 | 1-18 | const tabs | Imports, tab definitions, auth headers and timestamp formatting |
| 2 | 19-31 | function PrintReport | Print portal renders all four sections from the last successful response |
| 3 | 32-45 | export default function AnalyticsDashboard | Tab, data, freshness, refresh, and export state |
| 4 | 46-73 | const refresh | Summary request, transient failure recovery, and access-denied state |
| 5 | 74-88 | jumpTarget | Request cleanup and focus after an Overview shortcut |
| 6 | 89-99 | function switchTab | Keyboard navigation and automatic tab activation |
| 7 | 100-132 | async function download | Excel and PDF downloads and status feedback |
| 8 | 133-161 | an-header | Toolbar, freshness and error messages, and first-load skeleton |
| 9 | 162-180 | Analytics sections | Accessible tablist and panels, Overview shortcuts, and print portal |
