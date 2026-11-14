# DT-06 · AnalyticsDashboard.tsx

[Desktop slice index](../CODESLICE.md)

## DT-06 · desktop/src/features/analytics/AnalyticsDashboard.tsx
**LOC:** 225 · **Role:** Scoped desktop analytics for Doctor, Dentist, Nurse, and authorized Admin consoles.
**API surface:** GET /api/analytics/summary, /by-department, /report-access, /export/excel, and /export/pdf.
**Feature modules:** `analytics/tabs/` owns the section panels and drill-downs. `analytics/Charts.tsx` owns shared charts and exact-value tables. `analytics/data.ts` owns snapshot types and formatting. `analytics/PrintReport.tsx` renders the authorized print snapshot. `analytics/dashboard.css` owns the shared styles; its `--an-base` fluid root font (clamp on `vw`) plus em-relative sizes makes fonts, spacing and charts scale with the window/resolution.

| # | Lines | Anchor | Description |
|---|---|---|---|
| 1 | 1-13 | import PrintReport | Imports for scoped panels, navigation, and print |
| 2 | 14-48 | const clearAccess | Scoped tab and report state, request refs, and access-denied cleanup |
| 3 | 49-79 | const refresh | Summary request and transient failure recovery |
| 4 | 80-108 | afterprint | Lifecycle cleanup, permission refresh on focus, and tab focus recovery |
| 5 | 109-119 | function switchTab | Keyboard navigation across visible tabs |
| 6 | 120-177 | report-access | Downloads and live permission check for printing |
| 7 | 178-206 | an-header | Toolbar, freshness, error messages, and first-load skeleton |
| 8 | 207-225 | Analytics sections | Visible tabs, Overview shortcuts, and authorized print portal |
