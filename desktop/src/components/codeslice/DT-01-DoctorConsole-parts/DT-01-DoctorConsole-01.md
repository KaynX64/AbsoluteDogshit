<!-- split from desktop/src/components/codeslice/DT-01-DoctorConsole.md — part 01 of 02 -->
# DT-01 · DoctorConsole.tsx

Desktop component slice map · [index](../../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-01 · desktop/src/components/DoctorConsole.tsx
**LOC:** 3953 · **Anchor base:** 6710f4f + current changes · **Role:** Doctor/Dentist EMR console: consultation queue, encounters, e-Rx, clearances, dental chart, immunizations
**Mounted by:** desktop/src/App.tsx L955-961, rendered when activeRoleView is DOCTOR or DENTIST (props viewMode, onViewModeChange, currentRole)
**API surface:** GET /api/signature/me/status (L303); GET /api/appointments/today (L377); GET /api/appointments/patient/:id/history (paged via usePatientHistory, attachment view L539); GET /api/documents/attachments/:id/download (L568); PATCH /api/appointments/:id/status (L623); POST /api/appointments/:id/complete (L700); POST /api/documents/emr/:id/attachments (L719); GET /api/documents/prescriptions/patient/:id (L789); GET /api/documents/clearances/patient/:id (L816); GET /api/appointments/patients/search (L844); GET+PUT /api/profile/patient/:id/immunizations (L896, L977); GET /api/documents/:kind/:id/pdf (L1017, L1058); POST /api/documents/clearances (L1110)
**Socket events:** on appointment:booked (L414), appointment:status_changed (L415), queue:updated (L424), appointment:cancelled (L425); no emits
**State / key fields:** view: viewMode, signatureStatus, isDentist · queue: appointments, selectedApp, loadingAppointments, queueExpanded · workspace: workspacePanel · encounter: chiefComplaint, diagnosis, treatmentPlan, clinicalNotes, encounterConfirmation, isSubmittingEMR, feedbackMsg, attachedFile · vitals: bpSystolic, bpDiastolic, temperature, pulseRate, spo2, respRate, height, weight · dental: dentalChartData, selectedTooth · issuance: docType, clearancePurpose, clearancePurposeOther, clearanceRemarks, clearanceExpiryDate, isIssuingClearance · modals: showSignature, showHistoryModal, showRxHistoryModal, showClrHistoryModal, showImmunizationModal, previewModal, activePatientAttachments, openingAttachmentId · archive: patientSearchQuery, searchResults, selectedDirectoryPatient, directoryTimeline

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-49 | ToothCondition | imports, HistoryPageControls, and shared types |
| 2 | 50-91 | interface AppointmentItem | AppointmentItem shape (PHI, queue ticket, past EMR fields); DoctorConsoleProps |
| 3 | 92-127 | COMMON_VACCINES | STATUS_STYLE status-pill mapper; COMMON_VACCINES quick-add catalogue |
| 4 | 128-171 | CONDITION_COLORS | CONDITION_COLORS odontogram palette (sound, caries, filled, missing, extraction, prophylaxis) |
| 5 | 172-193 | UPPER_TEETH | UPPER_TEETH/LOWER_TEETH arrays; recognition of legacy sample text; stripLegacyOdontogram helpers |
| 6 | 195-220 | export default function DoctorConsole | component entry; showSignature/signatureStatus state; isDentist via prop or JWT roles fallback |
| 7 | 221-272 | dentalChartData | state: appointments, selectedApp; encounter form; attachments; dentalChartData; vitals fields |
| 8 | 273-329 | checkSignatureStatus | workspace state defaults to Documents, manual selection focus and useEffect GET /api/signature/me/status sets signatureStatus enrolled/missing/error |
| 9 | 330-369 | showHistoryModal | modal state: EMR, Rx and clearance history, archive directory search, immunization records |
| 10 | 370-410 | fetchAppointments | fetchAppointments GET /api/appointments/today?filter=active,scheduled,history; dedupe; selectPatient |
| 11 | 412-437 | appointment:booked | shared desktop socket subscription; on appointment:booked, appointment:status_changed, queue:updated, cancelled |
| 12 | 439-455 | offline-sync-conflict | useEffect listens for offline-sync-conflict window event; sets error feedbackMsg |
| 13 | 456-467 | resetForm | resetForm clears encounter fields, dental chart, attachments, feedback |
| 14 | 469-531 | selectPatient | selectPatient opens Documents and hydrates encounter fields plus nurse vitals from the first triage note line |
| 15 | 534-555 | fetchActivePatientAttachments | fetchActivePatientAttachments requests the attachment-only view and guards patient changes |
| 16 | 557-598 | handleOpenAttachment | handleOpenAttachment GET /api/documents/attachments/:id/download; blob preview modal; close revokes URL |
| 17 | 600-614 | handleToothConditionChange | handleToothConditionChange sets condition on selectedTooth in dentalChartData |
| 18 | 616-649 | handleStartConsultation | handleStartConsultation PATCH /api/appointments/:id/status to serving; refetches queue |
| 19 | 651-768 | handleFinishConsultation | finish consultation: review entered values, offline queue, POST /complete, POST emr attachments, feedback |
| 20 | 770-776 | handleViewPatientHistory | handleViewPatientHistory opens the paged history hook with a SQLite fallback |
| 21 | 778-833 | openPrescriptionHistory | openPrescriptionHistory + openClearanceHistory: GET issuer-only per-patient document lists |
| 22 | 835-876 | handleSearchPatientDirectory | handleSearchPatientDirectory GET /api/appointments/patients/search; offlineSearchPatients fallback |
| 23 | 878-880 | loadPatientTimeline | loadPatientTimeline selects the patient for the same paged history hook |
