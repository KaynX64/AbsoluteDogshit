# DT-07 · PrescriptionGenerator.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-07 · desktop/src/components/PrescriptionGenerator.tsx
**LOC:** 940 · **Anchor commit:** 5fe8005 + current changes · **Role:** e-Rx form: formulary/outside drug selection, interaction warnings, stock guards, confirm-and-issue flow
**Mounted by:** DoctorConsole.tsx (Documents view, docType rx, L2291; keyed per appointment)
**API surface:** GET /api/inventory/medicines (fetchCatalog) · POST /api/documents/prescriptions (handleSaveAndPrintPrescription) · POST /api/interactions/check via services/interactionService (live selection and pre-issue checks)
**Socket events:** none
**State / key fields:** rx form (rxFrequency, rxRoute, rxDurationDays, rxValidityDays, rxQuantity, rxInstructions, doctorNotes) · mode (rxMode formulary/outside, outsideName, outsideDosage) · catalog (medicines, selectedMedicineId; read-only strength, form and generic ingredient derived from selection) · guards (stockError, interactionResult, checkingInteractions) · flow (isSaving, showIssueConfirmation)

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-11 | — | imports; DEFAULT_FREQUENCY/INSTRUCTIONS/DOCTOR_NOTES constants; notes reset helper |
| 2 | 13-42 | PrescriptionGeneratorProps | MedicineMaster interface (stock fields); PrescriptionGeneratorProps: patient, verifiedPatient, callbacks |
| 3 | 44-62 | Hoisted Form Field Wrapper | Field: hoisted label+control wrapper (kept outside main component to preserve input focus) |
| 4 | 64-100 | ModePill | ModePill: segmented-control pill button (active/disabled styling) for formulary vs outside toggle |
| 5 | 102-127 | function FormularySelect | FormularySelect: themed medicine dropdown; filters to positive stock; open state and click-outside handler |
| 6 | 129-192 | Select medicine | FormularySelect trigger button: selected medicine name, live stock badge, chevron |
| 7 | 193-278 | Loading formulary | FormularySelect dropdown: in-stock medicines only; loading and no-stock empty states |
| 8 | 280-302 | — | PrescriptionGenerator component: props destructure; 12 useState (rx fields, isSaving); expiry helper |
| 9 | 304-321 | Outside-drug mode state | rxMode/outsideName state; stockError, interactionResult, checkingInteractions; doctorNotes sync effect |
| 10 | 323-345 | fetchCatalog | fetchCatalog: GET /api/inventory/medicines with 2 retries; mount useEffect |
| 11 | 347-367 | runCheck | selectedMed lookup; live interaction-check useEffect (checkDrugInteractions, cancellable) on med change |
| 12 | 369-375 | handleSwitchMode | switching sources clears outside dosage, stock warnings and interaction feedback |
| 13 | 377-437 | handleSaveAndPrintPrescription | draft and review use catalog strength, form and generic ingredient for formulary medicines and manual dosage for outside drugs |
| 14 | 438-455 | preCheck | confirmation gate, stock checks and contraindication guard before issuance |
| 15 | 456-486 | INSUFFICIENT_STOCK | POST /api/documents/prescriptions; SIGNATURE_NOT_ENROLLED, INSUFFICIENT_STOCK handling; onPrescriptionIssued |
| 16 | 488-500 | isOutOfStock | stock, interaction and outside medicine name guards |
| 17 | 501-543 | Verified Patient Demographic | patient safety bar: name, student_no, age only, sex, red allergy warning from verifiedPatient |
| 18 | 545-608 | Infirmary formulary | mode pills (Infirmary formulary / Outside pharmacy); FormularySelect field or outside-name input + hint |
| 19 | 611-669 | doctor-formulary-details | read-only dosage strength, dosage type and generic active ingredient, editable outside dosage, and quantity with live stock feedback |
| 20 | 671-710 | Prescription validity | frequency, intake method, duration, prescription-validity select grid |
| 21 | 712-731 | Instructions (sig) | instructions (sig) textarea; physician dietary/clinical notes input |
| 22 | 733-754 | Checking for drug interactions | interaction feedback: checking spinner; InteractionWarning banner with onDismiss (formulary only) |
| 23 | 756-798 | Issue, deduct inventory | submit button: disabled when saving/archived/blocked/out-of-stock/over-stock; dynamic label variants |
| 24 | 800-846 | Pharmacy stock shortfall | stock-shortfall modal: backdrop, rxStockIn animation, danger header Pharmacy stock shortfall |
| 25 | 849-890 | Shortfall | Available/Requested/Shortfall stat tiles rendered from stockError values |
| 26 | 892-930 | Set quantity to | FEFO note (restock via Nurse Console Inventory); Dismiss / Set quantity to N / Understood actions |
| 27 | 932-940 | ClinicalReview | prescription review, field edit actions and signing confirmation |
