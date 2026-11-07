# MB-03 · documents_viewer_screen.dart

Mobile screens slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py mobile/lib/screens/codeslice .`

## MB-03 · mobile/lib/screens/documents_viewer_screen.dart
**LOC:** 1576 · **Anchor commit:** 7cf9f16 · **Role:** Documents viewer: prescriptions, medical clearances, lab/imaging attachments with QR seals and PDF download.
**Mounted by:** PatientPortalScreen, patient_portal_screen.dart L812 (portal tab 4 of 5)
**API surface:** GET /api/documents/prescriptions/my (L55); GET /api/documents/clearances/my (L70); GET /api/documents/attachments/my (L85); GET /api/documents/{kind}/{id}/pdf (L120); POST /api/documents/attachments/{id}/download-token (L1468); GET /api/documents/attachments/{id}/download?dlToken (L1505 via launchUrl); QR encodes /api/documents/verify/{qrToken} (L177, L532)
**Socket events:** none
**State / key fields:** tabs: _selectedSubTab (0 prescriptions, 1 clearances, 2 lab and imaging)
data: _prescriptions, _clearances, _diagnosticAttachments (+ _loadingPrescriptions/_loadingClearances/_loadingDiagnostics)
io: _downloadingId (in-flight PDF guard), _storage (FlutterSecureStorage jwt_token)
palette: primaryGreen, softSage, textMain, textSub, borderColor

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-12 | — | imports: dart:convert/io, http, path_provider, qr_flutter, url_launcher, open_filex, ApiConfig, Rs |
| 2 | 13-19 | DocumentsViewerScreen | DocumentsViewerScreen StatefulWidget; createState binds _DocumentsViewerScreenState |
| 3 | 20-40 | _diagnosticAttachments | state: _selectedSubTab, rx/clearance/attachment lists + loading flags, _downloadingId; color consts |
| 4 | 41-48 | initState | initState fires _fetchPrescriptions, _fetchClearances, _fetchDiagnostics |
| 5 | 49-63 | _fetchPrescriptions | GET /api/documents/prescriptions/my; fills _prescriptions |
| 6 | 64-78 | _fetchClearances | GET /api/documents/clearances/my; fills _clearances |
| 7 | 79-93 | _fetchDiagnostics | GET /api/documents/attachments/my; fills _diagnosticAttachments |
| 8 | 94-107 | _formatDate | _formatDate: ISO date to Month D, YYYY with split('T') fallback |
| 9 | 108-171 | _downloadAndOpenPdf | GET /api/documents/{kind}/{id}/pdf; saves via path_provider, opens with OpenFilex; _downloadingId guard |
| 10 | 172-203 | _showPrescriptionDocumentModal | prescription modal: qr_token verify URL, showModalBottomSheet + DraggableScrollableSheet setup |
| 11 | 204-276 | PANGASINAN STATE UNIVERSITY | PSU infirmary letterhead, Rx emblem, OFFICIAL DIGITAL PRESCRIPTION banner |
| 12 | 277-363 | PRESCRIBED FORMULARY MEDICATION | medication line items: name, generic, dosage, sig, duration, qty, outside-pharmacy badge |
| 13 | 364-449 | QrImageView | doctor notes; QR verification seal: doctor, PRC license, issued and valid-until dates |
| 14 | 450-526 | Download Signed PDF | Download Signed PDF button (kind prescriptions) and Done close button |
| 15 | 527-600 | _showClearanceCertificateModal | clearance modal: qr_token verify URL, bottom sheet setup, PSU letterhead |
| 16 | 601-673 | TO WHOM IT MAY CONCERN | clearance body: fit certification, PURPOSE/STATUS box, valid-until date |
| 17 | 674-737 | R.A. 10173 DIGITAL SEAL | QR verification seal: doctor name, PRC license, issued date |
| 18 | 738-809 | Download Signed PDF | Download Signed PDF button (kind clearances) and Done close button |
| 19 | 810-885 | build | build: header copy, 3 sub-tabs (Prescriptions, Clearances, Lab & Imaging), body switch on _selectedSubTab |
| 20 | 886-916 | _buildSubTabButton | segmented sub-tab pill; tap sets _selectedSubTab |
| 21 | 917-950 | _buildPrescriptionsList | prescriptions tab: loading spinner and empty state |
| 22 | 951-973 | medStrength | card data derivation: items, status, medName, medStrength (outside Rx handling) |
| 23 | 974-1124 | View document | prescription cards: status pill, med name, doctor, issued/valid dates; View document opens modal |
| 24 | 1125-1158 | _buildClearancesList | clearances tab: loading spinner and empty state |
| 25 | 1159-1177 | isExpired | clearance card derivation: isExpired computed from expires_at |
| 26 | 1178-1325 | EXPIRED | clearance cards: EXPIRED/APPROVED pill, purpose, valid-until, doctor; View document opens modal |
| 27 | 1326-1360 | _buildDiagnosticsList | lab and imaging tab: loading spinner and empty state |
| 28 | 1361-1380 | downloadUrl | attachment builder: fileName, mime, isPdf/isImage, downloadUrl construction |
| 29 | 1381-1446 | Uploaded by Dr. | attachment cards: type icon, date, file name, uploading doctor specialty |
| 30 | 1447-1544 | dlToken | Open & View File: POST download-token (SEC-06 single-use dlToken) then launchUrl external app |
| 31 | 1545-1576 | _buildSampleDisclaimer | R.A. 10173 records disclaimer footer card |
