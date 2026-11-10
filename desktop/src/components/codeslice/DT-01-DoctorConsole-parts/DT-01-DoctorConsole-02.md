<!-- split from desktop/src/components/codeslice/DT-01-DoctorConsole.md — part 02 of 02 -->
| 24 | 918-1002 | openImmunizationModal | immunization modal handlers: open GET profile immunizations; quick-add, custom, remove (dedupe) |
| 25 | 1004-1042 | handleSaveImmunizations | handleSaveImmunizations PUT /api/profile/patient/:id/immunizations merged list |
| 26 | 1044-1086 | handleDownloadPdf | handleDownloadPdf GET /api/documents/:kind/:id/pdf; blob anchor download |
| 27 | 1088-1118 | openIssuedPdf | openIssuedPdf fetches issued PDF into previewModal object URL; alerts on failure |
| 28 | 1120-1166 | handlePrintClearance | handlePrintClearance POST /api/documents/clearances; SIGNATURE_NOT_ENROLLED opens enrollment |
| 29 | 1168-1206 | isArchivedMode | derived: isArchivedMode, isBookingMode, isDentalVisit; headerTitle/headerSub per viewMode |
| 30 | 1208-1238 | vd-page-head | page header: title/sub per viewMode; My signature button (setShowSignature) |
| 31 | 1239-1273 | Save signature | signature warning banner when signatureStatus missing or error |
| 32 | 1274-1280 | EmergencyAlertBanner | mounts EmergencyAlertBanner (SOS alerts; self-hides via 403 for non-responders) |
| 33 | 1281-1422 | queue_ticket | queue grid: loading/empty states; appointment cards (ticket, status pill, selectPatient) |
| 34 | 1423-1451 | AnalyticsDashboard | analytics view mounts AnalyticsDashboard; archive tab patient search form |
| 35 | 1452-1523 | Matched patients | archive sidebar: matched patients list; click loads timeline |
| 36 | 1524-1618 | selectedDirectoryPatient | archive patient card: blood/allergies; My prescriptions and My clearances buttons |
| 37 | 1619-1703 | No prior encounters on record. | archive timeline header and encounter cards (date, doctor, complaint, diagnosis, plan) |
| 38 | 1704-1785 | item.vitals | timeline vitals chips and diagnostic attachment buttons (handleOpenAttachment) |
| 39 | 1787-1936 | Patient safety strip | patient safety strip: identity, status pill, blood/allergies/conditions/sex/DOB/BMI |
| 40 | 1937-2079 | Begin consultation | action row: history buttons (EMR, Rx, clearance, immunizations); dental toggle; Begin consultation |
| 41 | 2081-2161 | Prior Diagnostic Records | prior diagnostic records strip: attachment chips open decrypted preview |
| 42 | 2163-2223 | Adult Dental Chart | odontogram panel header (Universal Numbering System); Reset Chart button |
| 43 | 2224-2303 | Maxillary Arch | upper teeth 1-16 grid buttons; CONDITION_COLORS; selectedTooth highlight |
| 44 | 2304-2375 | Mandibular Arch | lower teeth 32-17 grid buttons; condition letter codes |
| 45 | 2376-2445 | Set Finding for Tooth | selected-tooth finding picker pills (handleToothConditionChange) |
| 46 | 2447-2465 | View-only booking | isBookingMode view-only warning card |
| 47 | 2466-2536 | Official document issuance | workspace grid; issuance section header; rx vs clearance tab toggle (docType) |
| 48 | 2538-2591 | Shared issuance feedback banner | feedbackMsg banner plus Download PDF button (handleDownloadPdf) |
| 49 | 2593-2628 | PrescriptionGenerator | mounts PrescriptionGenerator; onPrescriptionIssued triggers openIssuedPdf preview |
| 50 | 2629-2729 | Clearance purpose | clearance form: purpose select; expiry date with +30d/+6mo/+1y shortcut buttons |
| 51 | 2730-2793 | Clinical fitness statement | clearance remarks textarea; Issue, sign and print button (handlePrintClearance) |
| 52 | 2794-2854 | Encounter diagnosis & vitals | encounter column header; archived-record and not-yet-triaged notices |
| 53 | 2855-2942 | Nurse-recorded vitals | read-only vitals output grid: BP/temp/pulse/SpO2/resp/height/weight/sex/BMI |
| 54 | 2943-3085 | Chief complaint | chief complaint, diagnosis, treatment plan inputs; attach lab result file input |
| 55 | 3086-3130 | Finish consultation & discharge | submit button states: submitting, archived, awaiting triage (handleFinishConsultation) |
| 56 | 3131-3179 | Confirm encounter details | encounter confirmation modal reviewing defaulted fields before finalize |
| 57 | 3181-3265 | Prescriptions you issued | Rx history modal: header, error, loading and empty states |
| 58 | 3266-3402 | OUTSIDE Rx | Rx history cards: items dosage/frequency/route, OUTSIDE Rx badge, Download PDF |
| 59 | 3404-3488 | Clearances you issued | clearance history modal: header, error, loading and empty states |
| 60 | 3489-3594 | isPastExpiry | clearance cards: approved/expired/revoked status, purpose, validity, Download PDF |
| 61 | 3596-3665 | No prior encounters recorded. | Past EMR History portal to document.body keeps the backdrop above the sticky top bar. Header, loading and empty states. |
| 62 | 3666-3791 | doctor_license | EMR history cards: diagnosis, complaint, plan, notes, Rx notes, lab attachments |
| 63 | 3793-3874 | Immunization records | immunization modal header with patient identity |
| 64 | 3876-3996 | Quick-add common vaccines | current immunization chips; COMMON_VACCINES quick-add buttons |
| 65 | 3998-4136 | Pending additions | custom immunization input; pending additions chips; feedback banner |
| 66 | 4139-4197 | Records are appended | immunization modal footer: Cancel and Save N records (handleSaveImmunizations) |
| 67 | 4199-4339 | Save to PC | attachment preview modal: header, Save to PC download, PDF iframe or image |
| 68 | 4341-4374 | SignatureEnrollment | signature enrollment overlay; onSaved sets signatureStatus enrolled |
