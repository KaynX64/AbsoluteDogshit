# MB-03 · documents_viewer_screen.dart

Mobile screens slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-03 · mobile/lib/screens/documents_viewer_screen.dart
**LOC:** 2105 · **Anchor verification:** current account-theme working tree · **Role:** Documents viewer: prescriptions, medical clearances, lab/imaging attachments with QR seals, PDF download, and content-sized grid layouts.
**Mounted by:** PatientPortalScreen, patient_portal_screen.dart (portal tab 4 of 5)
**API surface:** GET /api/documents/prescriptions/my; GET /api/documents/clearances/my; GET /api/documents/attachments/my; GET /api/documents/{kind}/{id}/pdf; POST /api/documents/attachments/{id}/download-token; GET /api/documents/attachments/{id}/download?dlToken (L2059 via launchUrl); QR encodes /api/documents/verify/{qrToken} (L203,)
**Socket events:** none
**State / key fields:** tabs/layout: _selectedSubTab (0 prescriptions, 1 clearances, 2 lab and imaging), _isGridView (list/grid)
data: _prescriptions, _clearances, _diagnosticAttachments (+ _loadingPrescriptions/_loadingClearances/_loadingDiagnostics)
io: _downloadingId (in-flight PDF guard), _storage (FlutterSecureStorage jwt_token)
palette: primaryGreen, softSage, textMain, textSub, borderColor

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-13 | — | imports: dart:convert/io, http, path_provider, qr_flutter, url_launcher, open_filex, ApiConfig, Rs |
| 2 | 14-46 | DocumentsViewerScreen | screen state: selected sub-tab, list/grid mode, document data/loading, PDF guard, palette |
| 3 | 47-53 | initState | initState fires _fetchPrescriptions, _fetchClearances, _fetchDiagnostics |
| 4 | 54-68 | _fetchPrescriptions | GET /api/documents/prescriptions/my; fills _prescriptions |
| 5 | 69-83 | _fetchClearances | GET /api/documents/clearances/my; fills _clearances |
| 6 | 84-98 | _fetchDiagnostics | GET /api/documents/attachments/my; fills _diagnosticAttachments |
| 7 | 99-127 | _formatDate | long display date and compact MM/DD/YYYY option for the diagnostics grid |
| 8 | 128-200 | _downloadAndOpenPdf | GET /api/documents/{kind}/{id}/pdf; saves via path_provider, opens with OpenFilex; _downloadingId guard |
| 9 | 201-572 | _showPrescriptionDocumentModal | prescription modal: QR verify URL, PSU letterhead, medication details, seal, signed PDF |
| 10 | 573-865 | _showClearanceCertificateModal | clearance modal: QR verify URL, PSU letterhead, clearance body, seal, signed PDF |
| 11 | 866-957 | build | header copy, 3 document sub-tabs, selected-list body |
| 12 | 958-988 | _buildSubTabButton | segmented Prescriptions/Clearances/Lab & Imaging tab selector |
| 13 | 989-1058 | _buildLayoutSelector | compact accessible List/Grid layout selector |
| 14 | 1059-1298 | _buildDocumentGrid | responsive two/three-column layout with naturally sized cards and refresh |
| 15 | 1299-1525 | _buildPrescriptionsList | prescription loading/empty states, list cards, optional content-sized grid |
| 16 | 1526-1744 | _buildClearancesList | clearance loading/empty states, list cards, optional content-sized grid |
| 17 | 1745-1914 | _buildDiagnosticsList | diagnostics loading/empty states, list cards, optional content-sized grid |
| 18 | 1915-2024 | _buildDiagnosticGridCard | compact file card sized to its text and open action |
| 19 | 2025-2078 | _openDiagnosticDocument | POST single-use download-token then launchUrl external app |
| 20 | 2079-2105 | _buildSampleDisclaimer | R.A. 10173 records disclaimer footer card |
