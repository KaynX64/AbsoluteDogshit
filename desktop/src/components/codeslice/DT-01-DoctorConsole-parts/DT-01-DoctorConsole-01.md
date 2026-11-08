<!-- split from desktop/src/components/codeslice/DT-01-DoctorConsole.md — part 01 of 02 -->
# DT-01 · DoctorConsole.tsx

Desktop component slice map · [index](../../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-01 · desktop/src/components/DoctorConsole.tsx
**LOC:** 4366 · **Anchor commit:** 4a14140 · **Role:** Doctor/Dentist EMR console: consultation queue, encounters, e-Rx, clearances, dental chart, immunizations
**Mounted by:** desktop/src/App.tsx L769-775, rendered when activeRoleView is DOCTOR or DENTIST (props viewMode, onViewModeChange, currentRole)
**API surface:** GET /api/signature/me/status (L276); GET /api/appointments/today (L349); GET /api/appointments/patient/:id/history (L506,759,891); GET /api/documents/attachments/:id/download (L544); PATCH /api/appointments/:id/status (L599); POST /api/appointments/:id/complete (L680); POST /api/documents/emr/:id/attachments (L699); GET /api/documents/prescriptions/patient/:id (L798); GET /api/documents/clearances/patient/:id (L825); GET /api/appointments/patients/search (L853); GET+PUT /api/profile/patient/:id/immunizations (L932,1013); GET /api/documents/:kind/:id/pdf (L1053,1094); POST /api/documents/clearances (L1127)
**Socket events:** on appointment:booked (L393), appointment:status_changed (L394), queue:updated (L403), appointment:cancelled (L404); no emits
**State / key fields:** view: viewMode, signatureStatus, isDentist · queue: appointments, selectedApp, loadingAppointments · encounter: chiefComplaint, diagnosis, treatmentPlan, clinicalNotes, encounterConfirmation, isSubmittingEMR, feedbackMsg, attachedFile · vitals: bpSystolic, bpDiastolic, temperature, pulseRate, spo2, respRate, height, weight · dental: dentalChartData, selectedTooth, forceShowDentalChart · issuance: docType, clearancePurpose, clearanceRemarks, clearanceExpiryDate, isIssuingClearance · modals: showSignature, showHistoryModal, showRxHistoryModal, showClrHistoryModal, showImmunizationModal, previewModal, activePatientAttachments, openingAttachmentId · archive: patientSearchQuery, searchResults, selectedDirectoryPatient, directoryTimeline

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-33 | ToothCondition | imports; ToothCondition/ToothRecord/DoctorViewMode types |
| 2 | 34-75 | interface AppointmentItem | AppointmentItem shape (PHI, queue ticket, past EMR fields); DoctorConsoleProps |
| 3 | 76-111 | COMMON_VACCINES | STATUS_STYLE status-pill mapper; COMMON_VACCINES quick-add catalogue |
| 4 | 112-155 | CONDITION_COLORS | CONDITION_COLORS odontogram palette (sound, caries, filled, missing, extraction, prophylaxis) |
| 5 | 156-177 | UPPER_TEETH | UPPER_TEETH/LOWER_TEETH arrays; default complaint/diagnosis/plan text; stripLegacyOdontogram helpers |
| 6 | 179-204 | export default function DoctorConsole | component entry; showSignature/signatureStatus state; isDentist via prop or JWT roles fallback |
| 7 | 205-251 | dentalChartData | state: appointments, selectedApp; encounter form; attachments; dentalChartData; vitals fields |
| 8 | 252-300 | checkSignatureStatus | issuance tab state; useEffect GET /api/signature/me/status sets signatureStatus enrolled/missing/error |
| 9 | 301-340 | showHistoryModal | modal state: EMR, Rx and clearance history, archive directory search, immunization records |
| 10 | 341-383 | fetchAppointments | fetchAppointments GET /api/appointments/today?filter=active,scheduled,history; dedupe; selectPatient |
| 11 | 385-410 | appointment:booked | useEffect opens io(SOCKET_URL); on appointment:booked, appointment:status_changed, queue:updated, cancelled |
| 12 | 412-428 | offline-sync-conflict | useEffect listens for offline-sync-conflict window event; sets error feedbackMsg |
| 13 | 430-442 | resetForm | resetForm clears encounter fields, dental chart, attachments, feedback |
| 14 | 444-500 | selectPatient | selectPatient hydrates form from past EMR; regex-parses [TRIAGE VITALS]; restores dental chart |
| 15 | 502-529 | fetchActivePatientAttachments | fetchActivePatientAttachments GET /api/appointments/patient/:id/history; flattens attachments |
| 16 | 531-572 | handleOpenAttachment | handleOpenAttachment GET /api/documents/attachments/:id/download; blob preview modal; close revokes URL |
| 17 | 574-588 | handleToothConditionChange | handleToothConditionChange sets condition on selectedTooth in dentalChartData |
| 18 | 590-623 | handleStartConsultation | handleStartConsultation PATCH /api/appointments/:id/status to serving; refetches queue |
| 19 | 625-746 | handleFinishConsultation | finish consultation: defaults confirm, offline queue, POST /complete, POST emr attachments, feedback |
| 20 | 748-783 | handleViewPatientHistory | handleViewPatientHistory GET patient history; SQLite fallback offlineGetEmrHistory |
| 21 | 785-840 | openPrescriptionHistory | openPrescriptionHistory + openClearanceHistory: GET issuer-only per-patient document lists |
| 22 | 842-883 | handleSearchPatientDirectory | handleSearchPatientDirectory GET /api/appointments/patients/search; offlineSearchPatients fallback |
| 23 | 885-914 | loadPatientTimeline | loadPatientTimeline GET patient history into directoryTimeline; SQLite fallback |
