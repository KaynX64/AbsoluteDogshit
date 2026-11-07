# DT-07 · PrescriptionGenerator.tsx

Desktop component slice map · [index](../CODESLICE.md) · base commit `93b4172` · check from repo root: `python3 scripts/verify_codeslice.py desktop/src/components/codeslice .`

## DT-07 · desktop/src/components/PrescriptionGenerator.tsx
**LOC:** 1076 · **Anchor commit:** ba200f6 · **Role:** e-Rx form: formulary/outside drug selection, interaction warnings, stock guards, confirm-and-issue flow
**Mounted by:** DoctorConsole.tsx (consultation document drawer, docType rx, L2592; keyed per appointment)
**API surface:** GET /api/inventory/medicines (L339) · POST /api/documents/prescriptions (L447 outside, L537 formulary) · POST /api/interactions/check via services/interactionService (L376, L520)
**Socket events:** none
**State / key fields:** rx form (rxMedName, rxDosage, rxFrequency, rxDurationDays, rxValidityDays, rxQuantity, rxInstructions, doctorNotes) · mode (rxMode formulary/outside, outsideName) · catalog (medicines, selectedMedicineId, hasInitializedRef) · guards (stockError, interactionResult, checkingInteractions) · flow (isSaving, showIssueConfirmation)

| # | Lines | Anchor | Description |
|---|-------|--------|-------------|
| 1 | 1-20 | getInitialDoctorNotes | imports; DEFAULT_FREQUENCY/INSTRUCTIONS/DOCTOR_NOTES constants; notes reset helper |
| 2 | 22-51 | PrescriptionGeneratorProps | MedicineMaster interface (stock fields); PrescriptionGeneratorProps: patient, verifiedPatient, callbacks |
| 3 | 53-71 | Hoisted Form Field Wrapper | Field: hoisted label+control wrapper (kept outside main component to preserve input focus) |
| 4 | 73-109 | ModePill | ModePill: segmented-control pill button (active/disabled styling) for formulary vs outside toggle |
| 5 | 111-135 | function FormularySelect | FormularySelect: themed medicine dropdown; open state, wrapperRef, click-outside useEffect |
| 6 | 137-199 | Select medicine | FormularySelect trigger button: selected med label, live stock badge (Out of stock / N pcs), chevron |
| 7 | 200-282 | Loading formulary | FormularySelect dropdown list: per-medicine rows with stock badges; empty state Loading formulary |
| 8 | 284-313 | getExpiresAtDate | PrescriptionGenerator component: props destructure; 12 useState (rx fields, isSaving); expiry helper |
| 9 | 315-332 | Outside-drug mode state | rxMode/outsideName state; stockError, interactionResult, checkingInteractions; doctorNotes sync effect |
| 10 | 334-363 | fetchCatalog | fetchCatalog: GET /api/inventory/medicines with 2 retries; seeds first med; mount useEffect |
| 11 | 365-385 | runCheck | selectedMed lookup; live interaction-check useEffect (checkDrugInteractions, cancellable) on med change |
| 12 | 387-406 | handleSelectMedicine | handleSelectMedicine autofills name+dosage; handleSwitchMode toggles formulary/outside, clears guards |
| 13 | 408-443 | handleSaveAndPrintPrescription | issue handler: signatureEnrolled gate (onSignatureRequired), patient guard, outside name/qty validation |
| 14 | 444-492 | outside_drug_name | outside branch: POST /api/documents/prescriptions with outside_drug_name, purchase qty, zero dispense |
| 15 | 494-534 | preCheck | formulary branch: confirm gate, client stock checks, checkDrugInteractions preCheck blocks contraindicated |
| 16 | 536-591 | INSUFFICIENT_STOCK | POST /api/documents/prescriptions; SIGNATURE_NOT_ENROLLED, INSUFFICIENT_STOCK handling; onPrescriptionIssued |
| 17 | 593-611 | isOutOfStock | derived guards: isOutOfStock, isOverStock, isBlocked, isOutsideNameMissing; issueDefaults blank-field list |
| 18 | 613-657 | Verified Patient Demographic | patient safety bar: name, student_no, DOB/age, sex, red allergy warning from verifiedPatient |
| 19 | 659-722 | Infirmary formulary | mode pills (Infirmary formulary / Outside pharmacy); FormularySelect field or outside-name input + hint |
| 20 | 724-767 | Quantity prescribed | dosage + quantity grid; live stock-on-hand hint, OUT OF STOCK / exceeds-stock warnings (FEFO) |
| 21 | 769-804 | Prescription validity | frequency, duration, prescription-validity select (7-180 days) grid |
| 22 | 806-825 | Instructions (sig) | instructions (sig) textarea; physician dietary/clinical notes input |
| 23 | 827-848 | Checking for drug interactions | interaction feedback: checking spinner; InteractionWarning banner with onDismiss (formulary only) |
| 24 | 850-893 | Issue, deduct inventory | submit button: disabled when saving/archived/blocked/out-of-stock/over-stock; dynamic label variants |
| 25 | 895-941 | Pharmacy stock shortfall | stock-shortfall modal: backdrop, rxStockIn animation, danger header Pharmacy stock shortfall |
| 26 | 944-985 | Shortfall | Available/Requested/Shortfall stat tiles rendered from stockError values |
| 27 | 987-1025 | Set quantity to | FEFO note (restock via Nurse Console Inventory); Dismiss / Set quantity to N / Understood actions |
| 28 | 1027-1076 | Confirm prescription | issue-confirmation modal: issueDefaults review list; Go back and edit vs Confirm and issue; close |
