# DT-06 · AnalyticsDashboard.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-06 · desktop/src/components/AnalyticsDashboard.tsx
**LOC:** 1459 · **Anchor commit:** working tree · **Role:** Analytics dashboard: hand-rolled SVG charts (no chart lib), KPI cards, flu spike banner, theme-aware XLSX/PDF export controls
**Mounted by:** DoctorConsole.tsx L1423 (viewMode=analytics) · AdminConsole.tsx L1679 (analytics tab, gated by ANALYTICS_VIEW)
**API surface:** GET /api/analytics/summary (L616); GET /api/analytics/export/xlsx (L632); GET /api/analytics/export/pdf (L652, L692); GET /api/analytics/export/excel (L672)
**Socket events:** none
**State / key fields:** data: AnalyticsData (totalConsultations, totalStudents, emergencyMetrics, roleDistribution, timeSeries, emergencyTimeSeries, topDiagnoses, deptBreakdown, fluStats, highRiskGroups, lowStockMeds, pharmacy) · loading · exports: handleDownloadExcelXLSX, handleDownloadPdfReport, handleDownloadExcelXlsx, handleDownloadServerPdf (blob + anchor download) · derived: isFluSpike, getRoleTone, totalRegistered · charts: SvgLineChart, SvgVerticalBarChart, SvgHorizontalBarChart + buildSmoothPath, niceAxisStep — hand-rolled SVG, no external chart library · chart palette/chrome resolves live `T.*` tokens (svg stopColor/stroke/fill included) so every preset × mode repaints; the print-only header stays on fixed dark ink

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-82 | interface AnalyticsData | imports; interfaces TimePoint/DiagnosisItem/DeptItem/PharmacyMedicine/RoleItem; AnalyticsData payload (fluStats, lowStockMeds, pharmacy) |
| 2 | 83-98 | buildSmoothPath | buildSmoothPath: cubic-bezier SVG path builder for smooth line charts |
| 3 | 99-131 | No data recorded yet. | SvgLineChart props (themeColor, gradId, emptyMessage) + empty-state placeholder |
| 4 | 132-166 | areaPath | line geometry: maxCount/maxVal scaling, points map, smoothPath + areaPath |
| 5 | 167-212 | my-line-path | line chart svg: gradient defs, dashed guides w/ values, area fill, gradient stroke |
| 6 | 213-279 | Data points | point markers (filled/hollow circles), count labels, alternating x labels; svg close |
| 7 | 280-288 | niceAxisStep | banner + niceAxisStep (1/2/5 tick ladder); SvgVerticalBarChart empty-state placeholder |
| 8 | 289-364 | Adaptive geometry | bar geometry: minSlot tiers, canvas widens + scrolls, y ticks, label angle tiers, truncate |
| 9 | 365-452 | my-bar-rect | bar svg: gridlines + spine, gradient bars w/ title tooltips, value pills, rotated labels |
| 10 | 453-494 | scroll sideways to see all bars | footer: N distinct diagnoses count + sideways-scroll hint |
| 11 | 495-527 | SvgHorizontalBarChart | dept bar chart: empty-state placeholder + row geometry (padLeft 240, barThickness 26) |
| 12 | 528-611 | barHorizGrad | dept svg: department labels, pill track + gradient fill, value pill (N visits) |
| 13 | 612-628 | fetchAnalytics | AnalyticsDashboard: data/loading useState; fetchAnalytics GET /api/analytics/summary; mount useEffect |
| 14 | 629-647 | handleDownloadExcelXLSX | handleDownloadExcelXLSX: GET /api/analytics/export/xlsx → blob download .xlsx |
| 15 | 649-667 | handleDownloadPdfReport | handleDownloadPdfReport: GET /api/analytics/export/pdf → blob download .pdf |
| 16 | 669-687 | handleDownloadExcelXlsx | handleDownloadExcelXlsx: GET /api/analytics/export/excel → blob download .xlsx |
| 17 | 689-708 | handleDownloadServerPdf | handleDownloadServerPdf: GET /api/analytics/export/pdf (server-rendered) + revokeObjectURL |
| 18 | 710-743 | Loading campus epidemiological analytics | guards: loading spinner; !data error card (server not running) |
| 19 | 744-761 | getRoleTone | derived: isFluSpike; getRoleTone per-role color/icon map; totalRegistered sum |
| 20 | 762-765 | analytics-report-area | render root #analytics-report-area; @media print stylesheet (print-only visibility) |
| 21 | 766-786 | print-header | print-only header: PSU Lingayen campus title, RA 10173 line, generated timestamp (fixed dark ink — paper is always light) |
| 22 | 788-840 | Epidemiological analytics | toolbar: page head; Refresh, Export Excel .xlsx (selected-theme primary tint), Official PDF Report, Print View buttons use live theme tokens and consistent longhand borders |
| 23 | 842-953 | KPI cards | 4 KPI cards: enrolled students, total consultations, active emergencies, avg response time |
| 24 | 1016-1046 | EPIDEMIC SURVEILLANCE | flu surveillance banner: spike alert vs stable, past/prev 7-day counts; pill |
| 25 | 1047-1126 | Campus population & headcount by role | card 1: roleDistribution grid (getRoleTone tiles) + Total registered pill |
| 26 | 1127-1146 | 14-day consultation volume | card 2: consultation timeline; SvgLineChart on timeSeries (primary grad) |
| 27 | 1147-1171 | 14-day campus emergency incidents | card 3: emergency SOS timeline; SvgLineChart on emergencyTimeSeries (danger grad) |
| 28 | 1172-1191 | Top clinical diagnoses | cards 4-5: top diagnoses SvgVerticalBarChart; dept breakdown SvgHorizontalBarChart |
| 29 | 1192-1277 | Pharmacy activity | Rolling dispensing and returns alongside stock-first reorder priorities |
| 30 | 1278-1365 | High-risk student surveillance watchlist | card 7a: high-risk watchlist tiles asthma, hypertension, severe allergies, diabetes |
| 31 | 1366-1459 | Critical pharmacy inventory | card 7b: lowStockMeds table (name, batch, qty, expiry; critical flags) + closers |
