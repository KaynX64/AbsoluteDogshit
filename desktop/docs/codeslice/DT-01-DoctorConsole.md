# DT-01 · DoctorConsole.tsx

[Desktop slice index](../CODESLICE.md)

Anchor commit: `18b0a55` + working tree. Archived documents use `ConsultationDocuments.tsx` and shared history content. Queue badges render only for active checked-in/serving visits; slice ranges are unchanged by the badge condition.

## DT-01 · desktop/src/features/consultations/DoctorConsole.tsx

Presentation: `EncounterEditor.tsx`, `Odontogram.tsx`, `PastEmrHistory.tsx`, `PrescriptionHistory.tsx`, `ClearanceHistory.tsx`.

| # | Lines | Anchor | Entry point |
|---|---|---|---|
| 1 | 1-135 | — | Imports and declarations |
| 2 | 136-321 | export default function | export default function |
| 3 | 322-509 | const fetchAppointments | const fetchAppointments |
| 4 | 510-596 | const handleOpenAttachment | const handleOpenAttachment |
| 5 | 597-722 | const handleFinishConsultation | const handleFinishConsultation |
| 6 | 723-826 | const openPrescriptionHistory | const openPrescriptionHistory |
| 7 | 827-952 | const openImmunizationModal | const openImmunizationModal |
| 8 | 953-1049 | const handleDownloadPdf | const handleDownloadPdf |
| 9 | 1050-1904 | const handlePrintClearance | const handlePrintClearance |
| 10 | 1905-2269 | <Odontogram | <Odontogram |
| 11 | 2270-2358 | <EncounterEditor | <EncounterEditor |
| 12 | 2359-2363 | <PrescriptionHistory | <PrescriptionHistory |
| 13 | 2364-2368 | <ClearanceHistory | <ClearanceHistory |
| 14 | 2369-2374 | <PastEmrHistory | <PastEmrHistory |
| 15 | 2375-2780 | showImmunizationModal && | showImmunizationModal && |
| 16 | 2781-2915 | previewModal && | previewModal && |
| 17 | 2916-2938 | showSignature && | showSignature && |
