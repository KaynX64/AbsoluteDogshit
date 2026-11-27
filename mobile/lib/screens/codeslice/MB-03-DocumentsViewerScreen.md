# MB-03 · documents_viewer_screen.dart

Mobile screens slice map · [index](../CODESLICE.md) · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-03 · mobile/lib/screens/documents_viewer_screen.dart
**LOC:** 2205 · **Anchor commit:** working tree · **Role:** Documents viewer: prescriptions, medical clearances, lab/imaging attachments with QR seals, PDF download, and content-sized grid layouts.
**Mounted by:** PatientPortalScreen, patient_portal_screen.dart (portal tab 4 of 5)
**API surface:** GET /api/documents/prescriptions/my; GET /api/documents/clearances/my; GET /api/documents/attachments/my; GET /api/documents/{kind}/{id}/pdf; POST /api/documents/attachments/{id}/download-token; GET /api/documents/attachments/{id}/download?dlToken (via launchUrl); prescription and clearance QR seals encode /api/documents/verify/{qrToken}
**Socket events:** none
**State / key fields:** tabs/layout: _selectedSubTab (0 prescriptions, 1 clearances, 2 lab and imaging), _isGridView (list/grid)
data: _prescriptions, _clearances, _diagnosticAttachments (+ _loadingPrescriptions/_loadingClearances/_loadingDiagnostics)
io: _downloadingId (in-flight PDF guard), _storage (FlutterSecureStorage jwt_token)
palette: primaryGreen, softSage, textMain, textSub, borderColor

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-28 | — | Imports for material_ui, HTTP, paths, QR, file opening, API config and responsive layout |
| 2 | 29-77 | DocumentsViewerScreen | screen state: selected sub-tab, list/grid mode, document data/loading, PDF guard, palette |
| 3 | 78-112 | initState | Restore session tab/layout state and load the selected category on demand |
| 4 | 113-125 | _fetchPrescriptions | Load prescription data through the shared document fetch and error state |
| 5 | 126-126 | _fetchClearances | Refresh clearance data and its server-reported status |
| 6 | 127-192 | _fetchDiagnostics | Diagnostic fetch wrapper, shared document fetch with retry messages and status helpers. |
| 7 | 193-221 | _formatDate | Date presentation helpers. |
| 8 | 222-294 | _downloadAndOpenPdf | Stream the PDF to a partial file, then open it. Report download and storage failures. |
| 9 | 295-688 | _showPrescriptionDocumentModal | prescription modal: QR verify URL, PSU letterhead, medication details, seal, signed PDF |
| 10 | 689-986 | _showClearanceCertificateModal | clearance modal: QR verify URL, PSU letterhead, clearance body, seal, signed PDF |
| 11 | 987-1089 | build | Header, document sub-tabs, list and grid controls and per-category retry messages. |
| 12 | 1090-1125 | _buildSubTabButton | segmented Prescriptions/Clearances/Lab & Imaging tab selector |
| 13 | 1126-1197 | _buildLayoutSelector | compact accessible List/Grid layout selector |
| 14 | 1198-1409 | _buildDocumentGrid | lazy independent two/three-column sliver lists preserving natural card heights and refresh |
| 15 | 1410-1630 | _buildPrescriptionsList | prescription loading/empty states, list cards, optional lazy content-sized grid |
| 16 | 1631-1838 | _buildClearancesList | clearance loading/empty states, list cards, optional lazy content-sized grid |
| 17 | 1839-2012 | _buildDiagnosticsList | diagnostics loading/empty states, list cards, optional lazy content-sized grid |
| 18 | 2013-2124 | _buildDiagnosticGridCard | compact file card sized to its text and open action |
| 19 | 2125-2178 | _openDiagnosticDocument | Request a single-use download token and open the attachment link, with separate failure messages. |
| 20 | 2179-2205 | _buildSampleDisclaimer | R.A. 10173 records disclaimer footer card |
