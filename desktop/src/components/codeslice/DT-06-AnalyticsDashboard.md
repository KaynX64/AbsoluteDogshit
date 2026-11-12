# DT-06 · AnalyticsDashboard.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-06 · desktop/src/components/AnalyticsDashboard.tsx
**LOC:** 1454 · **Anchor commit:** working tree · **Role:** Analytics dashboard: hand-rolled SVG charts (no chart lib), KPI cards, flu spike banner, theme-aware XLSX/PDF export controls
**Mounted by:** DoctorConsole.tsx L1423 (viewMode=analytics) · AdminConsole.tsx L1679 (analytics tab, gated by ANALYTICS_VIEW)
**API surface:** GET /api/analytics/summary (L606); GET /api/analytics/export/xlsx (L623); GET /api/analytics/export/pdf (L643, L683); GET /api/analytics/export/excel (L663)
**Socket events:** none
**State / key fields:** data: AnalyticsData (totalConsultations, totalStudents, emergencyMetrics, roleDistribution, timeSeries, emergencyTimeSeries, topDiagnoses, deptBreakdown, fluStats, highRiskGroups, lowStockMeds, topPrescribedMedicines) · loading · exports: handleDownloadExcelXLSX, handleDownloadPdfReport, handleDownloadExcelXlsx, handleDownloadServerPdf (blob + anchor download) · derived: isFluSpike, getRoleTone, totalRegistered · charts: SvgLineChart, SvgVerticalBarChart, SvgHorizontalBarChart + buildSmoothPath, niceAxisStep — hand-rolled SVG, no external chart library · chart palette/chrome resolves live `T.*` tokens (svg stopColor/stroke/fill included) so every preset × mode repaints; the print-only header stays on fixed dark ink

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-76 | interface AnalyticsData | imports; interfaces TimePoint/DiagnosisItem/DeptItem/TopPrescribedMedicine/RoleItem; AnalyticsData payload (fluStats, lowStockMeds, topPrescribedMedicines) |
| 2 | 77-92 | buildSmoothPath | buildSmoothPath: cubic-bezier SVG path builder for smooth line charts |
| 3 | 93-125 | No data recorded yet. | SvgLineChart props (themeColor, gradId, emptyMessage) + empty-state placeholder |
| 4 | 126-160 | areaPath | line geometry: maxCount/maxVal scaling, points map, smoothPath + areaPath |
| 5 | 161-206 | my-line-path | line chart svg: gradient defs, dashed guides w/ values, area fill, gradient stroke |
| 6 | 207-273 | Data points | point markers (filled/hollow circles), count labels, alternating x labels; svg close |
| 7 | 274-282 | niceAxisStep | banner + niceAxisStep (1/2/5 tick ladder); SvgVerticalBarChart empty-state placeholder |
| 8 | 283-358 | Adaptive geometry | bar geometry: minSlot tiers, canvas widens + scrolls, y ticks, label angle tiers, truncate |
| 9 | 359-446 | my-bar-rect | bar svg: gridlines + spine, gradient bars w/ title tooltips, value pills, rotated labels |
| 10 | 447-488 | scroll sideways to see all bars | footer: N distinct diagnoses count + sideways-scroll hint |
| 11 | 489-521 | SvgHorizontalBarChart | dept bar chart: empty-state placeholder + row geometry (padLeft 240, barThickness 26) |
| 12 | 522-605 | barHorizGrad | dept svg: department labels, pill track + gradient fill, value pill (N visits) |
| 13 | 606-622 | fetchAnalytics | AnalyticsDashboard: data/loading useState; fetchAnalytics GET /api/analytics/summary; mount useEffect |
| 14 | 623-641 | handleDownloadExcelXLSX | handleDownloadExcelXLSX: GET /api/analytics/export/xlsx → blob download .xlsx |
| 15 | 643-661 | handleDownloadPdfReport | handleDownloadPdfReport: GET /api/analytics/export/pdf → blob download .pdf |
| 16 | 663-681 | handleDownloadExcelXlsx | handleDownloadExcelXlsx: GET /api/analytics/export/excel → blob download .xlsx |
| 17 | 683-702 | handleDownloadServerPdf | handleDownloadServerPdf: GET /api/analytics/export/pdf (server-rendered) + revokeObjectURL |
| 18 | 704-737 | Loading campus epidemiological analytics | guards: loading spinner; !data error card (server not running) |
| 19 | 738-755 | getRoleTone | derived: isFluSpike; getRoleTone per-role color/icon map; totalRegistered sum |
| 20 | 756-759 | analytics-report-area | render root #analytics-report-area; @media print stylesheet (print-only visibility) |
| 21 | 760-780 | print-header | print-only header: PSU Lingayen campus title, RA 10173 line, generated timestamp (fixed dark ink — paper is always light) |
| 22 | 782-834 | Epidemiological analytics | toolbar: page head; Refresh, Export Excel .xlsx (selected-theme primary tint), Official PDF Report, Print View buttons use live theme tokens and consistent longhand borders |
| 23 | 836-947 | KPI cards | 4 KPI cards: enrolled students, total consultations, active emergencies, avg response time |
| 24 | 1010-1040 | EPIDEMIC SURVEILLANCE | flu surveillance banner: spike alert vs stable, past/prev 7-day counts; pill |
| 25 | 1041-1120 | Campus population & headcount by role | card 1: roleDistribution grid (getRoleTone tiles) + Total registered pill |
| 26 | 1121-1140 | 14-day consultation volume | card 2: consultation timeline; SvgLineChart on timeSeries (primary grad) |
| 27 | 1141-1165 | 14-day campus emergency incidents | card 3: emergency SOS timeline; SvgLineChart on emergencyTimeSeries (danger grad) |
| 28 | 1166-1185 | Top clinical diagnoses | cards 4-5: top diagnoses SvgVerticalBarChart; dept breakdown SvgHorizontalBarChart |
| 29 | 1186-1282 | Top prescribed medicines | ranked formulary demand list with current stock and reorder suggestion quantities |
| 30 | 1283-1360 | High-risk student surveillance watchlist | card 7a: high-risk watchlist tiles asthma, hypertension, severe allergies, diabetes |
| 31 | 1361-1454 | Critical pharmacy inventory | card 7b: lowStockMeds table (name, batch, qty, expiry; critical flags) + closers |
