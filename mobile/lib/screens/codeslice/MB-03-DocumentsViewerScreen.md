# MB-03 · documents_viewer_screen.dart

Mobile screens slice map · [index](../CODESLICE.md) · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-03 · mobile/lib/screens/documents_viewer_screen.dart
**LOC:** 2198 · **Anchor commit:** working tree · **Role:** Documents viewer: prescriptions, medical clearances, lab/imaging attachments with QR seals, PDF download, and content-sized grid layouts.
**Mounted by:** PatientPortalScreen, patient_portal_screen.dart (portal tab 4 of 5)
**API surface:** GET /api/documents/prescriptions/my; GET /api/documents/clearances/my; GET /api/documents/attachments/my; GET /api/documents/{kind}/{id}/pdf; POST /api/documents/attachments/{id}/download-token; GET /api/documents/attachments/{id}/download?dlToken (via launchUrl); prescription and clearance QR seals encode /api/documents/verify/{qrToken}
**Socket events:** none
**State / key fields:** tabs/layout: _selectedSubTab (0 prescriptions, 1 clearances, 2 lab and imaging), _isGridView (list/grid)
data: _prescriptions, _clearances, _diagnosticAttachments (+ _loadingPrescriptions/_loadingClearances/_loadingDiagnostics)
io: _downloadingId (in-flight PDF guard), _storage (FlutterSecureStorage jwt_token)
palette: primaryGreen, softSage, textMain, textSub, borderColor

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-27 | — | Imports for material_ui, HTTP, paths, QR, file opening, API config and responsive layout |
| 2 | 28-76 | DocumentsViewerScreen | screen state: selected sub-tab, list/grid mode, document data/loading, PDF guard, palette |
| 3 | 77-111 | initState | Restore session tab/layout state and load the selected category on demand |
| 4 | 112-124 | _fetchPrescriptions | Load prescription data through the shared document fetch and error state |
| 5 | 125-125 | _fetchClearances | Refresh clearance data and its server-reported status |
| 6 | 126-184 | _fetchDiagnostics | Diagnostic list fetch wrapper |
| 7 | 185-213 | _formatDate | Shared document fetch and status helpers, followed by date presentation |
| 8 | 214-282 | _downloadAndOpenPdf | GET /api/documents/{kind}/{id}/pdf; streams to a partial file using path_provider and opens the completed PDF with OpenFilex; _downloadingId guard |
| 9 | 283-676 | _showPrescriptionDocumentModal | prescription modal: QR verify URL, PSU letterhead, medication details, seal, signed PDF |
| 10 | 677-974 | _showClearanceCertificateModal | clearance modal: QR verify URL, PSU letterhead, clearance body, seal, signed PDF |
| 11 | 975-1077 | build | header copy, 3 document sub-tabs, selected-list body |
| 12 | 1078-1113 | _buildSubTabButton | segmented Prescriptions/Clearances/Lab & Imaging tab selector |
| 13 | 1114-1185 | _buildLayoutSelector | compact accessible List/Grid layout selector |
| 14 | 1186-1397 | _buildDocumentGrid | lazy independent two/three-column sliver lists preserving natural card heights and refresh |
| 15 | 1398-1617 | _buildPrescriptionsList | prescription loading/empty states, list cards, optional lazy content-sized grid |
| 16 | 1618-1825 | _buildClearancesList | clearance loading/empty states, list cards, optional lazy content-sized grid |
| 17 | 1826-1999 | _buildDiagnosticsList | diagnostics loading/empty states, list cards, optional lazy content-sized grid |
| 18 | 2000-2111 | _buildDiagnosticGridCard | compact file card sized to its text and open action |
| 19 | 2112-2168 | _openDiagnosticDocument | POST single-use download-token then launchUrl external app |
| 20 | 2169-2198 | _buildSampleDisclaimer | R.A. 10173 records disclaimer footer card |
