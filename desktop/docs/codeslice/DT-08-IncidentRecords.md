# DT-08 · IncidentRecords.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/docs/codeslice .`

## DT-08 · desktop/src/features/emergency/IncidentRecords.tsx
**LOC:** 994 · **Anchor commit:** working tree · **Role:** Admin view of documented SOS incidents: searchable list, server PDF preview, save and print (MinIO archive)
**Mounted by:** AdminConsole.tsx L1684 (activeTab === 'incidents')
**API surface:** GET /api/emergency/incident-reports?search= (L66, L68) · GET /api/emergency/incident-reports/:reportId/pdf (L109)
**Socket events:** on emergency:incident_reported -> refetch records (L97)
**State / key fields:** list (records, loading, error, search) · modal (selectedRecord, activeModalTab preview/details, previewPdfUrl, loadingPdf, pdfError) · actions (actionInProgressId, printIframeRef) · derived (stats useMemo: total, archivedMinIO, withTreatment, avgRespSec)

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-14 | useActionFeedback | imports for the dialog and feedback, shared desktop events, API, theme and icons |
| 2 | 15-44 | export interface IncidentRecord | exported IncidentRecord type: reportId, incidentDetails, treatmentNotes, pdfAvailable/pdfS3Key, patient, alert |
| 3 | 45-64 | printIframeRef | component start; useState: records, loading, error, search, selectedRecord, PDF preview states, activeModalTab |
| 4 | 65-88 | fetchRecords | fetchRecords: GET /api/emergency/incident-reports with optional search param; Bearer auth; error state |
| 5 | 89-105 | emergency:incident_reported | mount effect: initial fetchRecords; shared desktop socket; on emergency:incident_reported refetch |
| 6 | 106-118 | fetchPdfBlob | fetchPdfBlob: GET /api/emergency/incident-reports/:reportId/pdf as Blob (server-generated PDF) |
| 7 | 119-151 | handleView | handleView opens modal tab preview + loads blob URL; handleCloseModal revokes URL, resets state |
| 8 | 152-183 | handleSavePdf | handleSavePdf: reuse or fetch blob, anchor download as incident-report-IR####.pdf; delayed revoke |
| 9 | 184-239 | handlePrintPdf | handlePrintPdf: print via modal iframe or hidden 0x0 iframe; window.open fallback; 120s cleanup |
| 10 | 240-262 | formatDuration | stats useMemo: total, archivedMinIO, withTreatment, avgRespSec; formatDuration helper |
| 11 | 263-324 | Emergency Incident Records | page header: title, MinIO archive subtitle, Refresh button (fetchRecords) |
| 12 | 325-375 | Total Incidents Documented | stats ribbon tiles: Total Incidents Documented, Archived in MinIO, Clinical Intervention, Avg Response |
| 13 | 376-447 | Search Records | search bar: Enter-to-search input, clear button, Search Records button; passes search to fetchRecords |
| 14 | 448-520 | No Incident Records Found | body states: loading spinner, error card + Try Again, empty state + Clear Search |
| 15 | 521-593 | Archived in MinIO | record card top row: IR-#### and SOS-#### badges, MinIO archive chip, resolved timestamp |
| 16 | 594-660 | Save PDF | card actions: View (handleView), Save PDF (handleSavePdf), Print (handlePrintPdf); isWorking disable |
| 17 | 661-736 | Incident Narrative | card details grid: patient col (name, ID, affiliation, phone), incident narrative clamp, responder meta |
| 18 | 737-789 | <Dialog | view modal using the shared native dialog, IR badge, patient title, resolved/documented-by meta |
| 19 | 790-888 | PDF Document | modal toolbar: PDF Document / Incident Summary tab pills, Save PDF, Print, close buttons |
| 20 | 889-926 | printIframeRef | preview tab: retrieving-PDF spinner, PDF error + Retry, blob-URL iframe (printIframeRef) |
| 21 | 927-962 | Dispatch & Resolution Timeline | details tab: Patient Identification grid; Dispatch & Resolution Timeline (SOS, ack, GPS) |
| 22 | 963-994 | Incident Narrative & Findings | details tab: narrative + treatment blocks; modal and component close |
