# DT-07 · PrescriptionGenerator.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-07 · desktop/src/components/PrescriptionGenerator.tsx
**LOC:** 915 · **Anchor commit:** ba200f6 · **Role:** e-Rx form: formulary/outside drug selection, interaction warnings, stock guards, confirm-and-issue flow
**Mounted by:** DoctorConsole.tsx (consultation document drawer, docType rx, L2592; keyed per appointment)
**API surface:** GET /api/inventory/medicines (L339) · POST /api/documents/prescriptions (handleSaveAndPrintPrescription) · POST /api/interactions/check via services/interactionService (L376, L520)
**Socket events:** none
**State / key fields:** rx form (rxDosage, rxFrequency, rxRoute, rxDurationDays, rxValidityDays, rxQuantity, rxInstructions, doctorNotes) · mode (rxMode formulary/outside, outsideName) · catalog (medicines, selectedMedicineId) · guards (stockError, interactionResult, checkingInteractions) · flow (isSaving, showIssueConfirmation)

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-11 | — | imports; DEFAULT_FREQUENCY/INSTRUCTIONS/DOCTOR_NOTES constants; notes reset helper |
| 2 | 13-42 | PrescriptionGeneratorProps | MedicineMaster interface (stock fields); PrescriptionGeneratorProps: patient, verifiedPatient, callbacks |
| 3 | 44-62 | Hoisted Form Field Wrapper | Field: hoisted label+control wrapper (kept outside main component to preserve input focus) |
| 4 | 64-100 | ModePill | ModePill: segmented-control pill button (active/disabled styling) for formulary vs outside toggle |
| 5 | 102-126 | function FormularySelect | FormularySelect: themed medicine dropdown; open state, wrapperRef, click-outside useEffect |
| 6 | 128-191 | Select medicine | FormularySelect trigger button: selected med label, live stock badge (Out of stock / N pcs), chevron |
| 7 | 192-274 | Loading formulary | FormularySelect dropdown list: per-medicine rows with stock badges; empty state Loading formulary |
| 8 | 276-298 | — | PrescriptionGenerator component: props destructure; 12 useState (rx fields, isSaving); expiry helper |
| 9 | 300-317 | Outside-drug mode state | rxMode/outsideName state; stockError, interactionResult, checkingInteractions; doctorNotes sync effect |
| 10 | 319-341 | fetchCatalog | fetchCatalog: GET /api/inventory/medicines with 2 retries; seeds first med; mount useEffect |
| 11 | 343-363 | runCheck | selectedMed lookup; live interaction-check useEffect (checkDrugInteractions, cancellable) on med change |
| 12 | 365-376 | handleSelectMedicine | select a medicine and clear the previous dosage. Mode changes clear the dosing selection and stock warnings. |
| 13 | 378-427 | handleSaveAndPrintPrescription | draft payload and field review, with signature and patient checks before issuance |
| 15 | 428-445 | preCheck | formulary branch: confirm gate, client stock checks, checkDrugInteractions preCheck blocks contraindicated |
| 16 | 446-476 | INSUFFICIENT_STOCK | POST /api/documents/prescriptions; SIGNATURE_NOT_ENROLLED, INSUFFICIENT_STOCK handling; onPrescriptionIssued |
| 17 | 478-490 | isOutOfStock | stock, interaction and outside medicine name guards |
| 18 | 491-535 | Verified Patient Demographic | patient safety bar: name, student_no, DOB/age, sex, red allergy warning from verifiedPatient |
| 19 | 537-600 | Infirmary formulary | mode pills (Infirmary formulary / Outside pharmacy); FormularySelect field or outside-name input + hint |
| 20 | 602-644 | Quantity prescribed | dosage + quantity grid; live stock-on-hand hint, OUT OF STOCK / exceeds-stock warnings (FEFO) |
| 21 | 646-685 | Prescription validity | frequency, duration, prescription-validity select (7-180 days) grid |
| 22 | 687-706 | Instructions (sig) | instructions (sig) textarea; physician dietary/clinical notes input |
| 23 | 708-729 | Checking for drug interactions | interaction feedback: checking spinner; InteractionWarning banner with onDismiss (formulary only) |
| 24 | 731-773 | Issue, deduct inventory | submit button: disabled when saving/archived/blocked/out-of-stock/over-stock; dynamic label variants |
| 25 | 775-821 | Pharmacy stock shortfall | stock-shortfall modal: backdrop, rxStockIn animation, danger header Pharmacy stock shortfall |
| 26 | 824-865 | Shortfall | Available/Requested/Shortfall stat tiles rendered from stockError values |
| 27 | 867-905 | Set quantity to | FEFO note (restock via Nurse Console Inventory); Dismiss / Set quantity to N / Understood actions |
| 28 | 907-914 | ClinicalReview | prescription review, field edit actions and signing confirmation |
