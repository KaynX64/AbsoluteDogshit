# DT-08 · IncidentRecords.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/docs/codeslice .`

## DT-08 · desktop/src/features/emergency/IncidentRecords.tsx
**LOC:** 999 · **Anchor commit:** 93b4172 · **Role:** Admin view of documented SOS incidents: searchable list, server PDF preview, save and print (MinIO archive)
**Mounted by:** AdminConsole.tsx L1684 (activeTab === 'incidents')
**API surface:** GET /api/emergency/incident-reports?search= (L66, L68) · GET /api/emergency/incident-reports/:reportId/pdf (L109)
**Socket events:** on emergency:incident_reported -> refetch records (L97)
**State / key fields:** list (records, loading, error, search) · modal (selectedRecord, activeModalTab preview/details, previewPdfUrl, loadingPdf, pdfError) · actions (actionInProgressId, printIframeRef) · derived (stats useMemo: total, archivedMinIO, withTreatment, avgRespSec)

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-12 | createPortal | imports for the portal, shared desktop events, API, theme and icons |
| 2 | 14-42 | export interface IncidentRecord | exported IncidentRecord type: reportId, incidentDetails, treatmentNotes, pdfAvailable/pdfS3Key, patient, alert |
| 3 | 44-58 | printIframeRef | component start; useState: records, loading, error, search, selectedRecord, PDF preview states, activeModalTab |
| 4 | 60-85 | fetchRecords | fetchRecords: GET /api/emergency/incident-reports with optional search param; Bearer auth; error state |
| 5 | 87-102 | emergency:incident_reported | mount effect: initial fetchRecords; shared desktop socket; on emergency:incident_reported refetch |
| 6 | 104-115 | fetchPdfBlob | fetchPdfBlob: GET /api/emergency/incident-reports/:reportId/pdf as Blob (server-generated PDF) |
| 7 | 117-148 | handleView | handleView opens modal tab preview + loads blob URL; handleCloseModal revokes URL, resets state |
| 8 | 150-178 | handleSavePdf | handleSavePdf: reuse or fetch blob, anchor download as incident-report-IR####.pdf; delayed revoke |
| 9 | 180-232 | handlePrintPdf | handlePrintPdf: print via modal iframe or hidden 0x0 iframe; window.open fallback; 120s cleanup |
| 10 | 234-255 | formatDuration | stats useMemo: total, archivedMinIO, withTreatment, avgRespSec; formatDuration helper |
| 11 | 257-316 | Emergency Incident Records | page header: title, MinIO archive subtitle, Refresh button (fetchRecords) |
| 12 | 318-367 | Total Incidents Documented | stats ribbon tiles: Total Incidents Documented, Archived in MinIO, Clinical Intervention, Avg Response |
| 13 | 369-439 | Search Records | search bar: Enter-to-search input, clear button, Search Records button; passes search to fetchRecords |
| 14 | 441-512 | No Incident Records Found | body states: loading spinner, error card + Try Again, empty state + Clear Search |
| 15 | 514-586 | Archived in MinIO | record card top row: IR-#### and SOS-#### badges, MinIO archive chip, resolved timestamp |
| 16 | 587-652 | Save PDF | card actions: View (handleView), Save PDF (handleSavePdf), Print (handlePrintPdf); isWorking disable |
| 17 | 654-728 | Incident Narrative | card details grid: patient col (name, ID, affiliation, phone), incident narrative clamp, responder meta |
| 18 | 730-797 | createPortal( | view modal via createPortal to body: backdrop, IR badge, patient title, resolved/documented-by meta |
| 19 | 798-894 | PDF Document | modal toolbar: PDF Document / Incident Summary tab pills, Save PDF, Print, close buttons |
| 20 | 896-930 | printIframeRef | preview tab: retrieving-PDF spinner, PDF error + Retry, blob-URL iframe (printIframeRef) |
| 21 | 931-968 | Dispatch & Resolution Timeline | details tab: Patient Identification grid; Dispatch & Resolution Timeline (SOS, ack, GPS) |
| 22 | 970-999 | Incident Narrative & Findings | details tab: narrative + treatment blocks; modal and component close |
