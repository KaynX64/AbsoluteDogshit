<!-- split from desktop/src/components/codeslice/DT-01-DoctorConsole.md — part 02 of 02 -->
| 24 | 880-964 | openImmunizationModal | immunization modal handlers: open GET profile immunizations; quick-add, custom, remove (dedupe) |
| 25 | 966-1004 | handleSaveImmunizations | handleSaveImmunizations PUT /api/profile/patient/:id/immunizations merged list |
| 26 | 1006-1048 | handleDownloadPdf | handleDownloadPdf GET /api/documents/:kind/:id/pdf; blob anchor download |
| 27 | 1050-1080 | openIssuedPdf | openIssuedPdf fetches issued PDF into previewModal object URL; alerts on failure |
| 28 | 1082-1146 | handlePrintClearance | handlePrintClearance POST /api/documents/clearances; SIGNATURE_NOT_ENROLLED opens enrollment |
| 29 | 1148-1179 | isArchivedMode | derived read-only flags, dental view eligibility and headings per view mode |
| 30 | 1181-1206 | vd-page-head | responsive page header: title and signature button (setShowSignature) |
| 31 | 1207-1241 | Save signature | signature warning banner when signatureStatus missing or error |
| 32 | 1242-1248 | EmergencyAlertBanner | mounts EmergencyAlertBanner (SOS alerts; self-hides via 403 for non-responders) |
| 33 | 1250-1270 | AnalyticsDashboard | analytics view mounts AnalyticsDashboard; archive tab patient search form |
| 34 | 1271-1343 | Matched patients | responsive archive results panel with selected patient state and empty search feedback |
| 35 | 1344-1438 | selectedDirectoryPatient | archive patient card: blood/allergies; My prescriptions and My clearances buttons |
| 36 | 1439-1523 | No prior encounters on record. | archive timeline header and encounter cards (date, doctor, complaint, diagnosis, plan) |
| 37 | 1524-1606 | item.vitals | timeline vitals, diagnostic attachments and older encounter controls |
| 38 | 1612-1708 | Patient safety strip | selected patient identity, safety flags and disclosure for long entries and demographics |
| 39 | 1709-1760 | Patient records | patient records disclosure with EMR history, prescriptions, clearances and immunizations |
| 40 | 1761-1795 | Nurse-recorded vitals | read-only vitals in the patient context and begin-consultation action |
| 41 | 1796-1856 | doctor-roster | compact queue, narrow-window disclosure and focus on the selected patient |
| 42 | 1865-1921 | Encounter and issuance feedback | shared status messages and PDF download action |
| 43 | 1922-1947 | doctor-workspace-switch | workspace navigation keeps encounter, prescription and dental drafts across view changes |
| 44 | 1948-2030 | Adult Dental Chart | separate dental chart view with adult chart heading and reset control |
| 45 | 2031-2084 | Maxillary Arch | scrollable upper arch with teeth 1–16 and accessible selection |
| 46 | 2085-2151 | Mandibular Arch | lower teeth 32-17 grid buttons; condition letter codes |
| 47 | 2152-2221 | Set Finding for Tooth | selected-tooth finding picker pills (handleToothConditionChange) |
| 48 | 2223-2241 | View-only booking | read-only booking notice until check-in |
| 49 | 2242-2288 | Document issuance | document panel with prescription and clearance controls |
| 50 | 2290-2326 | PrescriptionGenerator | mounts PrescriptionGenerator; onPrescriptionIssued triggers openIssuedPdf preview |
| 51 | 2327-2428 | Clearance purpose | clearance form: purpose select; expiry date with +30d/+6mo/+1y shortcut buttons |
| 52 | 2429-2492 | Clinical fitness statement | clearance remarks textarea; Issue, sign and print button (handlePrintClearance) |
| 53 | 2495-2536 | doctor-encounter-panel | clinical encounter heading and archived-record notice |
| 54 | 2537-2623 | doctor-writing-grid | chief complaint, diagnosis, treatment plan and clinical notes fields |
| 55 | 2624-2658 | Finish consultation & discharge | compact lab attachment and discharge actions that open the existing review |
| 56 | 2659-2712 | doctor-prior-attachments | prior diagnostic records disclosure and decrypted attachment preview |
| 57 | 2713-2723 | Review encounter | encounter and clearance review dialogs with field edit actions |
| 58 | 2724-2808 | Prescriptions you issued | Rx history modal: header, error, loading and empty states |
| 59 | 2809-2945 | OUTSIDE Rx | Rx history cards: items dosage/frequency/route, OUTSIDE Rx badge, Download PDF |
| 60 | 2947-3031 | Clearances you issued | clearance history modal: header, error, loading and empty states |
| 61 | 3032-3137 | isPastExpiry | clearance cards: approved/expired/revoked status, purpose, validity, Download PDF |
| 62 | 3139-3208 | No prior encounters recorded. | Past EMR History portal to document.body keeps the backdrop above the sticky top bar. Header, loading and empty states. |
| 63 | 3209-3335 | doctor_license | EMR history cards, prescription notes, lab attachments and older encounter controls |
| 64 | 3337-3418 | Immunization records | immunization modal header with patient identity |
| 65 | 3420-3540 | Quick-add common vaccines | current immunization chips; COMMON_VACCINES quick-add buttons |
| 66 | 3542-3680 | Pending additions | custom immunization input; pending additions chips; feedback banner |
| 67 | 3683-3741 | Records are appended | immunization modal footer: Cancel and Save N records (handleSaveImmunizations) |
| 68 | 3743-3883 | Save to PC | attachment preview modal: header, Save to PC download, PDF iframe or image |
| 69 | 3885-3918 | SignatureEnrollment | signature enrollment overlay; onSaved sets signatureStatus enrolled |
