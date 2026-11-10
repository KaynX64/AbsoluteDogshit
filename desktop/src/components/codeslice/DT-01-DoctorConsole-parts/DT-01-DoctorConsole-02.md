<!-- split from desktop/src/components/codeslice/DT-01-DoctorConsole.md — part 02 of 02 -->
| 24 | 872-956 | openImmunizationModal | immunization modal handlers: open GET profile immunizations; quick-add, custom, remove (dedupe) |
| 25 | 958-996 | handleSaveImmunizations | handleSaveImmunizations PUT /api/profile/patient/:id/immunizations merged list |
| 26 | 998-1040 | handleDownloadPdf | handleDownloadPdf GET /api/documents/:kind/:id/pdf; blob anchor download |
| 27 | 1042-1072 | openIssuedPdf | openIssuedPdf fetches issued PDF into previewModal object URL; alerts on failure |
| 28 | 1074-1120 | handlePrintClearance | handlePrintClearance POST /api/documents/clearances; SIGNATURE_NOT_ENROLLED opens enrollment |
| 29 | 1122-1160 | isArchivedMode | derived: isArchivedMode, isBookingMode, isDentalVisit; headerTitle/headerSub per viewMode |
| 30 | 1162-1192 | vd-page-head | page header: title/sub per viewMode; My signature button (setShowSignature) |
| 31 | 1193-1227 | Save signature | signature warning banner when signatureStatus missing or error |
| 32 | 1228-1234 | EmergencyAlertBanner | mounts EmergencyAlertBanner (SOS alerts; self-hides via 403 for non-responders) |
| 33 | 1235-1376 | queue_ticket | queue grid: loading/empty states; appointment cards (ticket, status pill, selectPatient) |
| 34 | 1377-1405 | AnalyticsDashboard | analytics view mounts AnalyticsDashboard; archive tab patient search form |
| 35 | 1406-1477 | Matched patients | archive sidebar: matched patients list; click loads timeline |
| 36 | 1478-1572 | selectedDirectoryPatient | archive patient card: blood/allergies; My prescriptions and My clearances buttons |
| 37 | 1573-1657 | No prior encounters on record. | archive timeline header and encounter cards (date, doctor, complaint, diagnosis, plan) |
| 38 | 1658-1740 | item.vitals | timeline vitals, diagnostic attachments and older encounter controls |
| 39 | 1742-1891 | Patient safety strip | patient safety strip: identity, status pill, blood/allergies/conditions/sex/DOB/BMI |
| 40 | 1892-2034 | Begin consultation | action row: history buttons (EMR, Rx, clearance, immunizations); dental toggle; Begin consultation |
| 41 | 2036-2116 | Prior Diagnostic Records | prior diagnostic records strip: attachment chips open decrypted preview |
| 42 | 2118-2178 | Adult Dental Chart | odontogram panel header (Universal Numbering System); Reset Chart button |
| 43 | 2179-2258 | Maxillary Arch | upper teeth 1-16 grid buttons; CONDITION_COLORS; selectedTooth highlight |
| 44 | 2259-2330 | Mandibular Arch | lower teeth 32-17 grid buttons; condition letter codes |
| 45 | 2331-2400 | Set Finding for Tooth | selected-tooth finding picker pills (handleToothConditionChange) |
| 46 | 2402-2420 | View-only booking | isBookingMode view-only warning card |
| 47 | 2421-2491 | Official document issuance | workspace grid; issuance section header; rx vs clearance tab toggle (docType) |
| 48 | 2493-2546 | Shared issuance feedback banner | feedbackMsg banner plus Download PDF button (handleDownloadPdf) |
| 49 | 2548-2583 | PrescriptionGenerator | mounts PrescriptionGenerator; onPrescriptionIssued triggers openIssuedPdf preview |
| 50 | 2584-2684 | Clearance purpose | clearance form: purpose select; expiry date with +30d/+6mo/+1y shortcut buttons |
| 51 | 2685-2748 | Clinical fitness statement | clearance remarks textarea; Issue, sign and print button (handlePrintClearance) |
| 52 | 2749-2809 | Encounter diagnosis & vitals | encounter column header; archived-record and not-yet-triaged notices |
| 53 | 2810-2897 | Nurse-recorded vitals | read-only vitals output grid: BP/temp/pulse/SpO2/resp/height/weight/sex/BMI |
| 54 | 2898-3040 | Chief complaint | chief complaint, diagnosis, treatment plan inputs; attach lab result file input |
| 55 | 3041-3085 | Finish consultation & discharge | submit button states: submitting, archived, awaiting triage (handleFinishConsultation) |
| 56 | 3086-3134 | Confirm encounter details | encounter confirmation modal reviewing defaulted fields before finalize |
| 57 | 3136-3220 | Prescriptions you issued | Rx history modal: header, error, loading and empty states |
| 58 | 3221-3357 | OUTSIDE Rx | Rx history cards: items dosage/frequency/route, OUTSIDE Rx badge, Download PDF |
| 59 | 3359-3443 | Clearances you issued | clearance history modal: header, error, loading and empty states |
| 60 | 3444-3549 | isPastExpiry | clearance cards: approved/expired/revoked status, purpose, validity, Download PDF |
| 61 | 3551-3620 | No prior encounters recorded. | Past EMR History portal to document.body keeps the backdrop above the sticky top bar. Header, loading and empty states. |
| 62 | 3621-3747 | doctor_license | EMR history cards, lab attachments and older encounter controls |
| 63 | 3749-3830 | Immunization records | immunization modal header with patient identity |
| 64 | 3832-3952 | Quick-add common vaccines | current immunization chips; COMMON_VACCINES quick-add buttons |
| 65 | 3954-4092 | Pending additions | custom immunization input; pending additions chips; feedback banner |
| 66 | 4095-4153 | Records are appended | immunization modal footer: Cancel and Save N records (handleSaveImmunizations) |
| 67 | 4155-4295 | Save to PC | attachment preview modal: header, Save to PC download, PDF iframe or image |
| 68 | 4297-4330 | SignatureEnrollment | signature enrollment overlay; onSaved sets signatureStatus enrolled |
