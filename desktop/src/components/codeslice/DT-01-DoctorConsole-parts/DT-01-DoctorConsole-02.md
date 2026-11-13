<!-- split from desktop/src/components/codeslice/DT-01-DoctorConsole.md — part 02 of 02 -->
| 24 | 880-964 | openImmunizationModal | immunization modal handlers: open GET profile immunizations; quick-add, custom, remove (dedupe) |
| 25 | 968-1006 | handleSaveImmunizations | handleSaveImmunizations PUT /api/profile/patient/:id/immunizations merged list |
| 26 | 1008-1050 | handleDownloadPdf | handleDownloadPdf GET /api/documents/:kind/:id/pdf; blob anchor download |
| 27 | 1052-1082 | openIssuedPdf | openIssuedPdf fetches issued PDF into previewModal object URL; alerts on failure |
| 28 | 1084-1150 | handlePrintClearance | validates and posts the standard or custom clearance purpose; SIGNATURE_NOT_ENROLLED opens enrollment |
| 29 | 1152-1183 | isArchivedMode | derived read-only flags, dental view eligibility and headings per view mode |
| 30 | 1185-1210 | vd-page-head | responsive page header: title and signature button (setShowSignature) |
| 31 | 1211-1245 | Save signature | signature warning banner on clinical views when signatureStatus is missing or error |
| 32 | 1246-1252 | EmergencyAlertBanner | mounts EmergencyAlertBanner (SOS alerts; self-hides via 403 for non-responders) |
| 33 | 1254-1274 | AnalyticsDashboard | analytics view mounts AnalyticsDashboard; archive tab patient search form |
| 34 | 1275-1347 | Matched patients | responsive archive results panel with selected patient state and empty search feedback |
| 35 | 1348-1442 | selectedDirectoryPatient | archive patient card: blood/allergies; My prescriptions and My clearances buttons |
| 36 | 1443-1527 | No prior encounters on record. | archive timeline header and encounter cards (date, doctor, complaint, diagnosis, plan) |
| 37 | 1528-1610 | item.vitals | timeline vitals, diagnostic attachments and older encounter controls |
| 38 | 1616-1712 | Patient safety strip | selected patient identity, safety flags and disclosure for long entries and demographics |
| 39 | 1713-1764 | Patient records | patient records disclosure with EMR history, prescriptions, clearances and immunizations |
| 40 | 1765-1799 | Nurse-recorded vitals | read-only vitals in the patient context and begin-consultation action |
| 41 | 1800-1860 | doctor-roster | compact queue, narrow-window disclosure and focus on the selected patient |
| 42 | 1869-1925 | Encounter and issuance feedback | shared status messages and PDF download action |
| 43 | 1926-1951 | doctor-workspace-switch | Documents-first workspace navigation; Encounter and Dental chart remain available and drafts persist across view changes |
| 44 | 1952-2034 | Adult Dental Chart | separate dental chart view with adult chart heading and reset control |
| 45 | 2035-2088 | Maxillary Arch | scrollable upper arch with teeth 1–16 and accessible selection |
| 46 | 2089-2155 | Mandibular Arch | lower teeth 32-17 grid buttons; condition letter codes |
| 47 | 2156-2225 | Set Finding for Tooth | selected-tooth finding picker pills (handleToothConditionChange) |
| 48 | 2227-2245 | View-only booking | read-only booking notice until check-in |
| 49 | 2246-2292 | Document issuance | document panel with prescription and clearance controls |
| 50 | 2294-2330 | PrescriptionGenerator | mounts PrescriptionGenerator; onPrescriptionIssued triggers openIssuedPdf preview |
| 51 | 2331-2459 | Clearance purpose | clearance form: purpose select with conditional custom-purpose field; expiry date shortcuts |
| 52 | 2460-2523 | Clinical fitness statement | clearance remarks textarea; Issue, sign and print button (handlePrintClearance) |
| 53 | 2526-2567 | doctor-encounter-panel | clinical encounter heading and archived-record notice |
| 54 | 2568-2654 | doctor-writing-grid | chief complaint, diagnosis, treatment plan and clinical notes fields |
| 55 | 2655-2689 | Finish consultation & discharge | compact lab attachment and discharge actions that open the existing review |
| 56 | 2690-2743 | doctor-prior-attachments | prior diagnostic records disclosure and decrypted attachment preview |
| 57 | 2744-2754 | Review encounter | encounter and clearance review dialogs with field edit actions |
| 58 | 2755-2839 | Prescriptions you issued | Rx history modal: header, error, loading and empty states |
| 59 | 2840-2976 | OUTSIDE Rx | Rx history cards: items dosage/frequency/route, OUTSIDE Rx badge, Download PDF |
| 60 | 2978-3062 | Clearances you issued | clearance history modal: header, error, loading and empty states |
| 61 | 3063-3168 | isPastExpiry | clearance cards: approved/expired/revoked status, purpose, validity, Download PDF |
| 62 | 3170-3241 | No prior encounters recorded. | Past EMR History portal to document.body keeps the backdrop above the sticky top bar. Header, loading and empty states. |
| 63 | 3242-3366 | doctor_license | EMR history cards, prescription notes, lab attachments and older encounter controls |
| 64 | 3368-3449 | Immunization records | immunization modal header with patient identity |
| 65 | 3451-3571 | Quick-add common vaccines | current immunization chips; COMMON_VACCINES quick-add buttons |
| 66 | 3573-3711 | Pending additions | custom immunization input; pending additions chips; feedback banner |
| 67 | 3714-3772 | Records are appended | immunization modal footer: Cancel and Save N records (handleSaveImmunizations) |
| 68 | 3774-3914 | Save to PC | attachment preview modal: header, Save to PC download, PDF iframe or image |
| 69 | 3916-3949 | SignatureEnrollment | signature enrollment overlay; onSaved sets signatureStatus enrolled |
