<!-- split from desktop/src/components/codeslice/DT-01-DoctorConsole.md — part 02 of 02 -->
| 24 | 869-953 | openImmunizationModal | immunization modal handlers: open GET profile immunizations; quick-add, custom, remove (dedupe) |
| 25 | 955-993 | handleSaveImmunizations | handleSaveImmunizations PUT /api/profile/patient/:id/immunizations merged list |
| 26 | 995-1037 | handleDownloadPdf | handleDownloadPdf GET /api/documents/:kind/:id/pdf; blob anchor download |
| 27 | 1039-1069 | openIssuedPdf | openIssuedPdf fetches issued PDF into previewModal object URL; alerts on failure |
| 28 | 1071-1135 | handlePrintClearance | handlePrintClearance POST /api/documents/clearances; SIGNATURE_NOT_ENROLLED opens enrollment |
| 29 | 1137-1175 | isArchivedMode | derived: isArchivedMode, isBookingMode, isDentalVisit; headerTitle/headerSub per viewMode |
| 30 | 1177-1198 | vd-page-head | responsive page header: title and signature button (setShowSignature) |
| 31 | 1199-1233 | Save signature | signature warning banner when signatureStatus missing or error |
| 32 | 1234-1240 | EmergencyAlertBanner | mounts EmergencyAlertBanner (SOS alerts; self-hides via 403 for non-responders) |
| 33 | 1241-1367 | queue_ticket | queue cards, initial loading and empty states, stable selection during realtime refresh |
| 34 | 1368-1397 | AnalyticsDashboard | analytics view mounts AnalyticsDashboard; archive tab patient search form |
| 35 | 1398-1470 | Matched patients | responsive archive results panel with selected patient state and empty search feedback |
| 36 | 1471-1565 | selectedDirectoryPatient | archive patient card: blood/allergies; My prescriptions and My clearances buttons |
| 37 | 1566-1650 | No prior encounters on record. | archive timeline header and encounter cards (date, doctor, complaint, diagnosis, plan) |
| 38 | 1651-1733 | item.vitals | timeline vitals, diagnostic attachments and older encounter controls |
| 39 | 1735-1884 | Patient safety strip | patient safety strip: identity, status pill, blood/allergies/conditions/sex/DOB/BMI |
| 40 | 1885-2027 | Begin consultation | action row: history buttons (EMR, Rx, clearance, immunizations); dental toggle; Begin consultation |
| 41 | 2029-2110 | Prior Diagnostic Records | prior diagnostic records strip: attachment chips open decrypted preview |
| 42 | 2112-2172 | Adult Dental Chart | odontogram panel header (Universal Numbering System); Reset Chart button |
| 43 | 2173-2247 | Maxillary Arch | scrollable upper arch with teeth 1–16 and accessible selection |
| 44 | 2248-2314 | Mandibular Arch | lower teeth 32-17 grid buttons; condition letter codes |
| 45 | 2315-2384 | Set Finding for Tooth | selected-tooth finding picker pills (handleToothConditionChange) |
| 46 | 2386-2404 | View-only booking | isBookingMode view-only warning card |
| 47 | 2405-2458 | Official document issuance | workspace grid; issuance section header; rx vs clearance tab toggle (docType) |
| 48 | 2460-2513 | Shared issuance feedback banner | feedbackMsg banner plus Download PDF button (handleDownloadPdf) |
| 49 | 2515-2551 | PrescriptionGenerator | mounts PrescriptionGenerator; onPrescriptionIssued triggers openIssuedPdf preview |
| 50 | 2552-2653 | Clearance purpose | clearance form: purpose select; expiry date with +30d/+6mo/+1y shortcut buttons |
| 51 | 2654-2717 | Clinical fitness statement | clearance remarks textarea; Issue, sign and print button (handlePrintClearance) |
| 52 | 2718-2767 | Encounter diagnosis & vitals | encounter column header; archived-record and not-yet-triaged notices |
| 53 | 2768-2839 | Nurse-recorded vitals | read-only vitals output grid: BP/temp/pulse/SpO2/resp/height/weight/sex/BMI |
| 54 | 2840-2988 | Chief complaint | chief complaint, diagnosis, treatment plan inputs; attach lab result file input |
| 55 | 2989-3033 | Finish consultation & discharge | submit button states: submitting, archived, awaiting triage (handleFinishConsultation) |
| 56 | 3034-3046 | — | encounter and clearance reviews with field edit actions |
| 57 | 3048-3132 | Prescriptions you issued | Rx history modal: header, error, loading and empty states |
| 58 | 3133-3269 | OUTSIDE Rx | Rx history cards: items dosage/frequency/route, OUTSIDE Rx badge, Download PDF |
| 59 | 3271-3355 | Clearances you issued | clearance history modal: header, error, loading and empty states |
| 60 | 3356-3461 | isPastExpiry | clearance cards: approved/expired/revoked status, purpose, validity, Download PDF |
| 61 | 3463-3532 | No prior encounters recorded. | Past EMR History portal to document.body keeps the backdrop above the sticky top bar. Header, loading and empty states. |
| 62 | 3533-3659 | doctor_license | EMR history cards, prescription notes, lab attachments and older encounter controls |
| 63 | 3661-3742 | Immunization records | immunization modal header with patient identity |
| 64 | 3744-3864 | Quick-add common vaccines | current immunization chips; COMMON_VACCINES quick-add buttons |
| 65 | 3866-4004 | Pending additions | custom immunization input; pending additions chips; feedback banner |
| 66 | 4007-4065 | Records are appended | immunization modal footer: Cancel and Save N records (handleSaveImmunizations) |
| 67 | 4067-4207 | Save to PC | attachment preview modal: header, Save to PC download, PDF iframe or image |
| 68 | 4209-4242 | SignatureEnrollment | signature enrollment overlay; onSaved sets signatureStatus enrolled |
