# DT-01 · DoctorConsole.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

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
| 24 | 916-1000 | openImmunizationModal | immunization modal handlers: open GET profile immunizations; quick-add, custom, remove (dedupe) |
| 25 | 1002-1040 | handleSaveImmunizations | handleSaveImmunizations PUT /api/profile/patient/:id/immunizations merged list |
| 26 | 1042-1084 | handleDownloadPdf | handleDownloadPdf GET /api/documents/:kind/:id/pdf; blob anchor download |
| 27 | 1086-1116 | openIssuedPdf | openIssuedPdf fetches issued PDF into previewModal object URL; alerts on failure |
| 28 | 1118-1164 | handlePrintClearance | handlePrintClearance POST /api/documents/clearances; SIGNATURE_NOT_ENROLLED opens enrollment |
| 29 | 1166-1204 | isArchivedMode | derived: isArchivedMode, isBookingMode, isDentalVisit; headerTitle/headerSub per viewMode |
| 30 | 1206-1236 | vd-page-head | page header: title/sub per viewMode; My signature button (setShowSignature) |
| 31 | 1237-1271 | Save signature | signature warning banner when signatureStatus missing or error |
| 32 | 1272-1278 | EmergencyAlertBanner | mounts EmergencyAlertBanner (SOS alerts; self-hides via 403 for non-responders) |
| 33 | 1279-1420 | queue_ticket | queue grid: loading/empty states; appointment cards (ticket, status pill, selectPatient) |
| 34 | 1421-1449 | AnalyticsDashboard | analytics view mounts AnalyticsDashboard; archive tab patient search form |
| 35 | 1450-1521 | Matched patients | archive sidebar: matched patients list; click loads timeline |
| 36 | 1522-1616 | selectedDirectoryPatient | archive patient card: blood/allergies; My prescriptions and My clearances buttons |
| 37 | 1617-1701 | No prior encounters on record. | archive timeline header and encounter cards (date, doctor, complaint, diagnosis, plan) |
| 38 | 1702-1783 | item.vitals | timeline vitals chips and diagnostic attachment buttons (handleOpenAttachment) |
| 39 | 1785-1934 | Patient safety strip | patient safety strip: identity, status pill, blood/allergies/conditions/sex/DOB/BMI |
| 40 | 1935-2077 | Begin consultation | action row: history buttons (EMR, Rx, clearance, immunizations); dental toggle; Begin consultation |
| 41 | 2079-2159 | Prior Diagnostic Records | prior diagnostic records strip: attachment chips open decrypted preview |
| 42 | 2161-2221 | Adult Dental Chart | odontogram panel header (Universal Numbering System); Reset Chart button |
| 43 | 2222-2301 | Maxillary Arch | upper teeth 1-16 grid buttons; CONDITION_COLORS; selectedTooth highlight |
| 44 | 2302-2373 | Mandibular Arch | lower teeth 32-17 grid buttons; condition letter codes |
| 45 | 2374-2443 | Set Finding for Tooth | selected-tooth finding picker pills (handleToothConditionChange) |
| 46 | 2445-2463 | View-only booking | isBookingMode view-only warning card |
| 47 | 2464-2534 | Official document issuance | workspace grid; issuance section header; rx vs clearance tab toggle (docType) |
| 48 | 2536-2589 | Shared issuance feedback banner | feedbackMsg banner plus Download PDF button (handleDownloadPdf) |
| 49 | 2591-2626 | PrescriptionGenerator | mounts PrescriptionGenerator; onPrescriptionIssued triggers openIssuedPdf preview |
| 50 | 2627-2727 | Clearance purpose | clearance form: purpose select; expiry date with +30d/+6mo/+1y shortcut buttons |
| 51 | 2728-2791 | Clinical fitness statement | clearance remarks textarea; Issue, sign and print button (handlePrintClearance) |
| 52 | 2792-2852 | Encounter diagnosis & vitals | encounter column header; archived-record and not-yet-triaged notices |
| 53 | 2853-2940 | Nurse-recorded vitals | read-only vitals output grid: BP/temp/pulse/SpO2/resp/height/weight/sex/BMI |
| 54 | 2941-3083 | Chief complaint | chief complaint, diagnosis, treatment plan inputs; attach lab result file input |
| 55 | 3084-3128 | Finish consultation & discharge | submit button states: submitting, archived, awaiting triage (handleFinishConsultation) |
| 56 | 3129-3177 | Confirm encounter details | encounter confirmation modal reviewing defaulted fields before finalize |
| 57 | 3179-3263 | Prescriptions you issued | Rx history modal: header, error, loading and empty states |
| 58 | 3264-3400 | OUTSIDE Rx | Rx history cards: items dosage/frequency/route, OUTSIDE Rx badge, Download PDF |
| 59 | 3402-3486 | Clearances you issued | clearance history modal: header, error, loading and empty states |
| 60 | 3487-3592 | isPastExpiry | clearance cards: approved/expired/revoked status, purpose, validity, Download PDF |
| 61 | 3594-3658 | No prior encounters recorded. | EMR history modal: header, loading and empty states |
| 62 | 3659-3783 | doctor_license | EMR history cards: diagnosis, complaint, plan, notes, Rx notes, lab attachments |
| 63 | 3785-3866 | Immunization records | immunization modal header with patient identity |
| 64 | 3868-3988 | Quick-add common vaccines | current immunization chips; COMMON_VACCINES quick-add buttons |
| 65 | 3990-4128 | Pending additions | custom immunization input; pending additions chips; feedback banner |
| 66 | 4131-4189 | Records are appended | immunization modal footer: Cancel and Save N records (handleSaveImmunizations) |
| 67 | 4191-4331 | Save to PC | attachment preview modal: header, Save to PC download, PDF iframe or image |
| 68 | 4333-4366 | SignatureEnrollment | signature enrollment overlay; onSaved sets signatureStatus enrolled |
