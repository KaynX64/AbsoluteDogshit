# DT-07 · PrescriptionGenerator.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-07 · desktop/src/components/PrescriptionGenerator.tsx
**LOC:** 938 · **Anchor commit:** 6710f4f + current changes · **Role:** e-Rx form: formulary/outside drug selection, interaction warnings, stock guards, confirm-and-issue flow
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
| 5 | 102-126 | function FormularySelect | FormularySelect: themed medicine dropdown; open state, wrapperRef, click-outside useEffect |
| 6 | 128-191 | Select medicine | FormularySelect trigger button: selected medicine name, live stock badge (Out of stock / N pcs), chevron |
| 7 | 192-274 | Loading formulary | FormularySelect dropdown list: per-medicine rows with stock badges; empty state Loading formulary |
| 8 | 276-298 | — | PrescriptionGenerator component: props destructure; 12 useState (rx fields, isSaving); expiry helper |
| 9 | 300-317 | Outside-drug mode state | rxMode/outsideName state; stockError, interactionResult, checkingInteractions; doctorNotes sync effect |
| 10 | 319-341 | fetchCatalog | fetchCatalog: GET /api/inventory/medicines with 2 retries; mount useEffect |
| 11 | 343-363 | runCheck | selectedMed lookup; live interaction-check useEffect (checkDrugInteractions, cancellable) on med change |
| 12 | 365-371 | handleSwitchMode | switching sources clears outside dosage, stock warnings and interaction feedback |
| 13 | 373-433 | handleSaveAndPrintPrescription | draft and review use catalog strength, form and generic ingredient for formulary medicines and manual dosage for outside drugs |
| 14 | 434-451 | preCheck | confirmation gate, stock checks and contraindication guard before issuance |
| 15 | 452-482 | INSUFFICIENT_STOCK | POST /api/documents/prescriptions; SIGNATURE_NOT_ENROLLED, INSUFFICIENT_STOCK handling; onPrescriptionIssued |
| 16 | 484-496 | isOutOfStock | stock, interaction and outside medicine name guards |
| 17 | 497-541 | Verified Patient Demographic | patient safety bar: name, student_no, DOB/age, sex, red allergy warning from verifiedPatient |
| 18 | 543-606 | Infirmary formulary | mode pills (Infirmary formulary / Outside pharmacy); FormularySelect field or outside-name input + hint |
| 19 | 609-667 | doctor-formulary-details | read-only dosage strength, dosage type and generic active ingredient, editable outside dosage, and quantity with live stock feedback |
| 20 | 669-708 | Prescription validity | frequency, duration, prescription-validity select grid |
| 21 | 710-729 | Instructions (sig) | instructions (sig) textarea; physician dietary/clinical notes input |
| 22 | 731-752 | Checking for drug interactions | interaction feedback: checking spinner; InteractionWarning banner with onDismiss (formulary only) |
| 23 | 754-796 | Issue, deduct inventory | submit button: disabled when saving/archived/blocked/out-of-stock/over-stock; dynamic label variants |
| 24 | 798-844 | Pharmacy stock shortfall | stock-shortfall modal: backdrop, rxStockIn animation, danger header Pharmacy stock shortfall |
| 25 | 847-888 | Shortfall | Available/Requested/Shortfall stat tiles rendered from stockError values |
| 26 | 890-928 | Set quantity to | FEFO note (restock via Nurse Console Inventory); Dismiss / Set quantity to N / Understood actions |
| 27 | 930-938 | ClinicalReview | prescription review, field edit actions and signing confirmation |
