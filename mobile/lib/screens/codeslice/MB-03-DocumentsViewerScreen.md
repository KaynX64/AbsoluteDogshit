# MB-03 · documents_viewer_screen.dart

Mobile screens slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-03 · mobile/lib/screens/documents_viewer_screen.dart
**LOC:** 2101 · **Anchor commit:** 7cf9f16 · **Role:** Documents viewer: prescriptions, medical clearances, lab/imaging attachments with QR seals, PDF download, and content-sized grid layouts.
**Mounted by:** PatientPortalScreen, patient_portal_screen.dart L812 (portal tab 4 of 5)
**API surface:** GET /api/documents/prescriptions/my (L58); GET /api/documents/clearances/my (L73); GET /api/documents/attachments/my (L88); GET /api/documents/{kind}/{id}/pdf (L138); POST /api/documents/attachments/{id}/download-token (L2026); GET /api/documents/attachments/{id}/download?dlToken (L2059 via launchUrl); QR encodes /api/documents/verify/{qrToken} (L203, L574)
**Socket events:** none
**State / key fields:** tabs/layout: _selectedSubTab (0 prescriptions, 1 clearances, 2 lab and imaging), _isGridView (list/grid)
data: _prescriptions, _clearances, _diagnosticAttachments (+ _loadingPrescriptions/_loadingClearances/_loadingDiagnostics)
io: _downloadingId (in-flight PDF guard), _storage (FlutterSecureStorage jwt_token)
palette: primaryGreen, softSage, textMain, textSub, borderColor

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-12 | — | imports: dart:convert/io, http, path_provider, qr_flutter, url_launcher, open_filex, ApiConfig, Rs |
| 2 | 13-45 | DocumentsViewerScreen | screen state: selected sub-tab, list/grid mode, document data/loading, PDF guard, palette |
| 3 | 46-52 | initState | initState fires _fetchPrescriptions, _fetchClearances, _fetchDiagnostics |
| 4 | 53-67 | _fetchPrescriptions | GET /api/documents/prescriptions/my; fills _prescriptions |
| 5 | 68-82 | _fetchClearances | GET /api/documents/clearances/my; fills _clearances |
| 6 | 83-97 | _fetchDiagnostics | GET /api/documents/attachments/my; fills _diagnosticAttachments |
| 7 | 98-126 | _formatDate | long display date and compact MM/DD/YYYY option for the diagnostics grid |
| 8 | 127-198 | _downloadAndOpenPdf | GET /api/documents/{kind}/{id}/pdf; saves via path_provider, opens with OpenFilex; _downloadingId guard |
| 9 | 199-569 | _showPrescriptionDocumentModal | prescription modal: QR verify URL, PSU letterhead, medication details, seal, signed PDF |
| 10 | 570-861 | _showClearanceCertificateModal | clearance modal: QR verify URL, PSU letterhead, clearance body, seal, signed PDF |
| 11 | 862-953 | build | header copy, 3 document sub-tabs, selected-list body |
| 12 | 954-984 | _buildSubTabButton | segmented Prescriptions/Clearances/Lab & Imaging tab selector |
| 13 | 985-1054 | _buildLayoutSelector | compact accessible List/Grid layout selector |
| 14 | 1055-1294 | _buildDocumentGrid | responsive two/three-column layout with naturally sized cards and refresh |
| 15 | 1295-1521 | _buildPrescriptionsList | prescription loading/empty states, list cards, optional content-sized grid |
| 16 | 1522-1740 | _buildClearancesList | clearance loading/empty states, list cards, optional content-sized grid |
| 17 | 1741-1910 | _buildDiagnosticsList | diagnostics loading/empty states, list cards, optional content-sized grid |
| 18 | 1911-2020 | _buildDiagnosticGridCard | compact file card sized to its text and open action |
| 19 | 2021-2074 | _openDiagnosticDocument | POST single-use download-token then launchUrl external app |
| 20 | 2075-2101 | _buildSampleDisclaimer | R.A. 10173 records disclaimer footer card |
