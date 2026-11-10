<!-- split from desktop/src/components/codeslice/DT-01-DoctorConsole.md — part 01 of 02 -->
# DT-01 · DoctorConsole.tsx

Desktop component slice map · [index](../../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-01 · desktop/src/components/DoctorConsole.tsx
**LOC:** 4330 · **Anchor base:** 2727901 + current changes · **Role:** Doctor/Dentist EMR console: consultation queue, encounters, e-Rx, clearances, dental chart, immunizations
**Mounted by:** desktop/src/App.tsx L955-961, rendered when activeRoleView is DOCTOR or DENTIST (props viewMode, onViewModeChange, currentRole)
**API surface:** GET /api/signature/me/status (L293); GET /api/appointments/today (L366); GET /api/appointments/patient/:id/history (paged via `usePatientHistory`, attachment view L527); GET /api/documents/attachments/:id/download (L556); PATCH /api/appointments/:id/status (L611); POST /api/appointments/:id/complete (L692); POST /api/documents/emr/:id/attachments (L711); GET /api/documents/prescriptions/patient/:id (L781); GET /api/documents/clearances/patient/:id (L808); GET /api/appointments/patients/search (L836); GET+PUT /api/profile/patient/:id/immunizations (L888,L967); GET /api/documents/:kind/:id/pdf (L1009,L1048); POST /api/documents/clearances (L1083)
**Socket events:** on appointment:booked (L410), appointment:status_changed (L411), queue:updated (L420), appointment:cancelled (L421); no emits
**State / key fields:** view: viewMode, signatureStatus, isDentist · queue: appointments, selectedApp, loadingAppointments · encounter: chiefComplaint, diagnosis, treatmentPlan, clinicalNotes, encounterConfirmation, isSubmittingEMR, feedbackMsg, attachedFile · vitals: bpSystolic, bpDiastolic, temperature, pulseRate, spo2, respRate, height, weight · dental: dentalChartData, selectedTooth, forceShowDentalChart · issuance: docType, clearancePurpose, clearanceRemarks, clearanceExpiryDate, isIssuingClearance · modals: showSignature, showHistoryModal, showRxHistoryModal, showClrHistoryModal, showImmunizationModal, previewModal, activePatientAttachments, openingAttachmentId · archive: patientSearchQuery, searchResults, selectedDirectoryPatient, directoryTimeline

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-47 | ToothCondition | imports, HistoryPageControls, and shared types |
| 2 | 48-89 | interface AppointmentItem | AppointmentItem shape (PHI, queue ticket, past EMR fields); DoctorConsoleProps |
| 3 | 90-125 | COMMON_VACCINES | STATUS_STYLE status-pill mapper; COMMON_VACCINES quick-add catalogue |
| 4 | 126-169 | CONDITION_COLORS | CONDITION_COLORS odontogram palette (sound, caries, filled, missing, extraction, prophylaxis) |
| 5 | 170-191 | UPPER_TEETH | UPPER_TEETH/LOWER_TEETH arrays; default complaint/diagnosis/plan text; stripLegacyOdontogram helpers |
| 6 | 193-218 | export default function DoctorConsole | component entry; showSignature/signatureStatus state; isDentist via prop or JWT roles fallback |
| 7 | 219-268 | dentalChartData | state: appointments, selectedApp; encounter form; attachments; dentalChartData; vitals fields |
| 8 | 269-317 | checkSignatureStatus | issuance tab state; useEffect GET /api/signature/me/status sets signatureStatus enrolled/missing/error |
| 9 | 318-357 | showHistoryModal | modal state: EMR, Rx and clearance history, archive directory search, immunization records |
| 10 | 358-400 | fetchAppointments | fetchAppointments GET /api/appointments/today?filter=active,scheduled,history; dedupe; selectPatient |
| 11 | 402-427 | appointment:booked | useEffect opens io(SOCKET_URL); on appointment:booked, appointment:status_changed, queue:updated, cancelled |
| 12 | 429-445 | offline-sync-conflict | useEffect listens for offline-sync-conflict window event; sets error feedbackMsg |
| 13 | 447-459 | resetForm | resetForm clears encounter fields, dental chart, attachments, feedback |
| 14 | 461-518 | selectPatient | selectPatient hydrates the encounter and reads nurse vitals from the first triage note line |
| 15 | 520-541 | fetchActivePatientAttachments | fetchActivePatientAttachments requests the attachment-only view and guards patient changes |
| 16 | 543-584 | handleOpenAttachment | handleOpenAttachment GET /api/documents/attachments/:id/download; blob preview modal; close revokes URL |
| 17 | 586-600 | handleToothConditionChange | handleToothConditionChange sets condition on selectedTooth in dentalChartData |
| 18 | 602-635 | handleStartConsultation | handleStartConsultation PATCH /api/appointments/:id/status to serving; refetches queue |
| 19 | 637-758 | handleFinishConsultation | finish consultation: defaults confirm, offline queue, POST /complete, POST emr attachments, feedback |
| 20 | 760-766 | handleViewPatientHistory | handleViewPatientHistory opens the paged history hook with a SQLite fallback |
| 21 | 768-823 | openPrescriptionHistory | openPrescriptionHistory + openClearanceHistory: GET issuer-only per-patient document lists |
| 22 | 825-866 | handleSearchPatientDirectory | handleSearchPatientDirectory GET /api/appointments/patients/search; offlineSearchPatients fallback |
| 23 | 868-870 | loadPatientTimeline | loadPatientTimeline selects the patient for the same paged history hook |
