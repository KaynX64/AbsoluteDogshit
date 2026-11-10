<!-- split from desktop/src/components/codeslice/DT-01-DoctorConsole.md — part 01 of 02 -->
# DT-01 · DoctorConsole.tsx

Desktop component slice map · [index](../../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-01 · desktop/src/components/DoctorConsole.tsx
**LOC:** 4374 · **Anchor base:** 2727901 + current changes · **Role:** Doctor/Dentist EMR console: consultation queue, encounters, e-Rx, clearances, dental chart, immunizations
**Mounted by:** desktop/src/App.tsx L955-961, rendered when activeRoleView is DOCTOR or DENTIST (props viewMode, onViewModeChange, currentRole)
**API surface:** GET /api/signature/me/status (L277); GET /api/appointments/today (L350); GET /api/appointments/patient/:id/history (L508,759,891); GET /api/documents/attachments/:id/download (L546); PATCH /api/appointments/:id/status (L601); POST /api/appointments/:id/complete (L682); POST /api/documents/emr/:id/attachments (L701); GET /api/documents/prescriptions/patient/:id (L800); GET /api/documents/clearances/patient/:id (L827); GET /api/appointments/patients/search (L855); GET+PUT /api/profile/patient/:id/immunizations (L934,1013); GET /api/documents/:kind/:id/pdf (L1055,1094); POST /api/documents/clearances (L1129)
**Socket events:** on appointment:booked (L394), appointment:status_changed (L395), queue:updated (L404), appointment:cancelled (L405); no emits
**State / key fields:** view: viewMode, signatureStatus, isDentist · queue: appointments, selectedApp, loadingAppointments · encounter: chiefComplaint, diagnosis, treatmentPlan, clinicalNotes, encounterConfirmation, isSubmittingEMR, feedbackMsg, attachedFile · vitals: bpSystolic, bpDiastolic, temperature, pulseRate, spo2, respRate, height, weight · dental: dentalChartData, selectedTooth, forceShowDentalChart · issuance: docType, clearancePurpose, clearanceRemarks, clearanceExpiryDate, isIssuingClearance · modals: showSignature, showHistoryModal, showRxHistoryModal, showClrHistoryModal, showImmunizationModal, previewModal, activePatientAttachments, openingAttachmentId · archive: patientSearchQuery, searchResults, selectedDirectoryPatient, directoryTimeline

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-34 | ToothCondition | imports; ToothCondition/ToothRecord/DoctorViewMode types |
| 2 | 35-76 | interface AppointmentItem | AppointmentItem shape (PHI, queue ticket, past EMR fields); DoctorConsoleProps |
| 3 | 77-112 | COMMON_VACCINES | STATUS_STYLE status-pill mapper; COMMON_VACCINES quick-add catalogue |
| 4 | 113-156 | CONDITION_COLORS | CONDITION_COLORS odontogram palette (sound, caries, filled, missing, extraction, prophylaxis) |
| 5 | 157-178 | UPPER_TEETH | UPPER_TEETH/LOWER_TEETH arrays; default complaint/diagnosis/plan text; stripLegacyOdontogram helpers |
| 6 | 180-205 | export default function DoctorConsole | component entry; showSignature/signatureStatus state; isDentist via prop or JWT roles fallback |
| 7 | 206-252 | dentalChartData | state: appointments, selectedApp; encounter form; attachments; dentalChartData; vitals fields |
| 8 | 253-301 | checkSignatureStatus | issuance tab state; useEffect GET /api/signature/me/status sets signatureStatus enrolled/missing/error |
| 9 | 302-341 | showHistoryModal | modal state: EMR, Rx and clearance history, archive directory search, immunization records |
| 10 | 342-384 | fetchAppointments | fetchAppointments GET /api/appointments/today?filter=active,scheduled,history; dedupe; selectPatient |
| 11 | 386-411 | appointment:booked | useEffect opens io(SOCKET_URL); on appointment:booked, appointment:status_changed, queue:updated, cancelled |
| 12 | 413-429 | offline-sync-conflict | useEffect listens for offline-sync-conflict window event; sets error feedbackMsg |
| 13 | 431-443 | resetForm | resetForm clears encounter fields, dental chart, attachments, feedback |
| 14 | 445-502 | selectPatient | selectPatient hydrates the encounter and reads nurse vitals from the first triage note line |
| 15 | 504-531 | fetchActivePatientAttachments | fetchActivePatientAttachments GET /api/appointments/patient/:id/history; flattens attachments |
| 16 | 533-574 | handleOpenAttachment | handleOpenAttachment GET /api/documents/attachments/:id/download; blob preview modal; close revokes URL |
| 17 | 576-590 | handleToothConditionChange | handleToothConditionChange sets condition on selectedTooth in dentalChartData |
| 18 | 592-625 | handleStartConsultation | handleStartConsultation PATCH /api/appointments/:id/status to serving; refetches queue |
| 19 | 627-748 | handleFinishConsultation | finish consultation: defaults confirm, offline queue, POST /complete, POST emr attachments, feedback |
| 20 | 750-785 | handleViewPatientHistory | handleViewPatientHistory GET patient history; SQLite fallback offlineGetEmrHistory |
| 21 | 787-842 | openPrescriptionHistory | openPrescriptionHistory + openClearanceHistory: GET issuer-only per-patient document lists |
| 22 | 844-885 | handleSearchPatientDirectory | handleSearchPatientDirectory GET /api/appointments/patients/search; offlineSearchPatients fallback |
| 23 | 887-916 | loadPatientTimeline | loadPatientTimeline GET patient history into directoryTimeline; SQLite fallback |
