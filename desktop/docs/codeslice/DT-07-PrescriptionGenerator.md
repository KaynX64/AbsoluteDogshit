# DT-07 · PrescriptionGenerator.tsx

[Desktop slice index](../CODESLICE.md)

## DT-07 · desktop/src/features/documents/PrescriptionGenerator.tsx

**LOC:** 2 · **Anchor commit:** working tree · **Role:** Stable import entry for structured prescribing.

`StructuredPrescriptionGenerator.tsx` owns the memory draft, capabilities, review and exact-request retries. `MedicationEditor.tsx` owns active medicine fields; `StructuredPrescriptionReview.tsx` owns review and acknowledgements. `prescribingTypes.ts` provides client types/validation. `structured-prescribing.css` contains compact layout and component scrolling. See the [API contract](../../../server/STRUCTURED-PRESCRIBING.md).

| # | Lines | Anchor | Entry point |
|---|---|---|---|
| 1 | 1-2 | export | Structured workflow and props re-exports |
