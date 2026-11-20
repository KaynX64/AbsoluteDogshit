# MB-03 · documents_viewer_screen.dart

Mobile screens slice map · [index](../CODESLICE.md) · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-03 · mobile/lib/screens/documents_viewer_screen.dart
**LOC:** 2140 · **Anchor commit:** working tree · **Role:** Documents viewer: prescriptions, medical clearances, lab/imaging attachments with QR seals, PDF download, and content-sized grid layouts.
**Mounted by:** PatientPortalScreen, patient_portal_screen.dart (portal tab 4 of 5)
**API surface:** GET /api/documents/prescriptions/my; GET /api/documents/clearances/my; GET /api/documents/attachments/my; GET /api/documents/{kind}/{id}/pdf; POST /api/documents/attachments/{id}/download-token; GET /api/documents/attachments/{id}/download?dlToken (via launchUrl); prescription and clearance QR seals encode /api/documents/verify/{qrToken}
**Socket events:** none
**State / key fields:** tabs/layout: _selectedSubTab (0 prescriptions, 1 clearances, 2 lab and imaging), _isGridView (list/grid)
data: _prescriptions, _clearances, _diagnosticAttachments (+ _loadingPrescriptions/_loadingClearances/_loadingDiagnostics)
io: _downloadingId (in-flight PDF guard), _storage (FlutterSecureStorage jwt_token)
palette: primaryGreen, softSage, textMain, textSub, borderColor

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-25 | — | imports: dart:convert/io, http, path_provider, qr_flutter, url_launcher, open_filex, ApiConfig, Rs |
| 2 | 26-60 | DocumentsViewerScreen | screen state: selected sub-tab, list/grid mode, document data/loading, PDF guard, palette |
| 3 | 61-90 | initState | Restore session tab/layout state and load the selected category on demand |
| 4 | 91-116 | _fetchPrescriptions | GET /api/documents/prescriptions/my; fills _prescriptions |
| 5 | 117-142 | _fetchClearances | GET /api/documents/clearances/my; fills _clearances |
| 6 | 143-168 | _fetchDiagnostics | GET /api/documents/attachments/my; fills _diagnosticAttachments |
| 7 | 169-197 | _formatDate | long display date and compact MM/DD/YYYY option for the diagnostics grid |
| 8 | 198-259 | _downloadAndOpenPdf | GET /api/documents/{kind}/{id}/pdf; streams to a partial file using path_provider and opens the completed PDF with OpenFilex; _downloadingId guard |
| 9 | 260-642 | _showPrescriptionDocumentModal | prescription modal: QR verify URL, PSU letterhead, medication details, seal, signed PDF |
| 10 | 643-935 | _showClearanceCertificateModal | clearance modal: QR verify URL, PSU letterhead, clearance body, seal, signed PDF |
| 11 | 936-1027 | build | header copy, 3 document sub-tabs, selected-list body |
| 12 | 1028-1063 | _buildSubTabButton | segmented Prescriptions/Clearances/Lab & Imaging tab selector |
| 13 | 1064-1135 | _buildLayoutSelector | compact accessible List/Grid layout selector |
| 14 | 1136-1353 | _buildDocumentGrid | lazy independent two/three-column sliver lists preserving natural card heights and refresh |
| 15 | 1354-1569 | _buildPrescriptionsList | prescription loading/empty states, list cards, optional lazy content-sized grid |
| 16 | 1570-1778 | _buildClearancesList | clearance loading/empty states, list cards, optional lazy content-sized grid |
| 17 | 1779-1947 | _buildDiagnosticsList | diagnostics loading/empty states, list cards, optional lazy content-sized grid |
| 18 | 1948-2059 | _buildDiagnosticGridCard | compact file card sized to its text and open action |
| 19 | 2060-2113 | _openDiagnosticDocument | POST single-use download-token then launchUrl external app |
| 20 | 2114-2140 | _buildSampleDisclaimer | R.A. 10173 records disclaimer footer card |