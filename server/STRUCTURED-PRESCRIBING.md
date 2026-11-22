# Structured prescribing contract

Version 2 is opt-in through `STRUCTURED_PRESCRIBING_ENABLED=true`. Migration 013 and updated desktop/mobile readers must be deployed first. Existing documents remain readable with the flag off. See [rollout and verification](PRESCRIBING-ROLLOUT.md).

## Endpoints

All prescribing endpoints require authentication and DOCTOR or DENTIST access. Issuance rechecks the active signer, PRC license, enrolled signature, patient eligibility and assigned checked-in/serving appointment in the database.

- `GET /api/documents/prescription-capabilities`: `{ contract_versions: [1,2], structured_issuance_enabled, max_items: 20 }`.
- `POST /api/documents/prescriptions/review`: validates and resolves the draft below; returns `{ draft, safety, fingerprint, review_token }`. The normalized draft is the review representation. Item errors contain `field` paths such as `items.0.quantity` and a message.
- `POST /api/documents/prescriptions`: accepts the same draft plus `review_token`, `issuance_request_id` and `acknowledgements`. Returns `{ prescriptionId, emrId, qrToken, pdfAvailable, replayed }`, with HTTP 201 for a new issue or 200 for a committed retry.

The review token is HMAC-authenticated, expires after five minutes, and binds the clinician, patient, appointment, ordered normalized content and interaction assessment. The server repeats these checks before writes. Changed identity, directions, ordering or findings require a new review.

## Draft shape

This is a software fixture, not treatment advice:

```json
{
  "contract_version": 2,
  "patient_user_id": 5,
  "appointment_id": 201,
  "expires_at": "2026-11-23",
  "notes": "Patient advice printed on the prescription",
  "items": [{
    "item_key": "distinct-client-uuid",
    "fulfillment": "external",
    "catalog_medicine_id": null,
    "generic_name": "Fixture generic",
    "generic_confirmed": true,
    "brand_name": "",
    "strength": "10 mg/5 mL",
    "form": "Suspension",
    "dose_amount": "2.5",
    "dose_unit": "mL",
    "route": "Oral",
    "schedule": { "kind": "fixed", "frequency": "Clinician-entered frequency" },
    "duration_days": 3,
    "review_on": "",
    "quantity": 15.5,
    "quantity_unit": "mL",
    "pack_size": "",
    "directions": "Complete clinician-entered patient directions"
  }]
}
```

Supply quantity is positive, with at most three decimal places externally; clinic lines use whole recorded inventory units. External supply units are the explicit list exported from `structuredContract.js`; containers require `pack_size`. Dose amounts accept positive decimals or fractions and supported dose units. No dose, limit or treatment quantity is calculated.

`schedule.kind` is `fixed`, `prn` or `custom`. Fixed requires `frequency` and a positive whole-number duration. PRN requires `prn_reason` and `prn_limits`; PRN/custom require duration or a current/future `review_on`. All schedules require patient directions. Prescription validity is independently entered, current/future and at most 180 days away. V2 automatic expiry follows prescription validity, not course duration.

At most 20 ordered items are accepted. Identity limits: generic/brand 200 characters, strength 100, form/route/unit 50, dose amount 32. Frequency is bounded to 100, PRN reason 200, limits 300, directions and patient advice 2000, pack size 100. Validation remains authoritative on the server.

Catalog references must resolve to active entries with recorded generic, strength and form. These fields come from the catalog during review and issuance. External lookup includes zero-stock catalog entries. Manual identities require the clinician's generic confirmation and remain unverified. Brand is optional. Catalog reference alone never authorizes dispensing: only `fulfillment: "clinic"` creates a physical `medicine_id` and stock movement.

## Safety and acknowledgement

`safety` includes `coverage`, catalog pair count, pairs with active local rules, unverified item keys, duplicate generic-name groups, findings and a scope statement. Coverage is `not_checked` for fewer than two distinct catalog identities; `partial` for unmapped items or missing pair rules; otherwise `local_rules_checked`. No result means comprehensive medication reconciliation or an automated allergy check.

All known catalog pairs in the draft are checked, including external items. Failed required checks propagate as failures; they never become an empty successful result. Contraindicated findings block issuance. Each severe finding requires a nonblank reason of at most 1000 characters, keyed by finding ID:

```json
{
  "patient_reviewed": true,
  "coverage_reviewed": true,
  "duplicates_reviewed": true,
  "severe_reasons": { "401": "Clinician-recorded justification" }
}
```

The patient attestation is always required; coverage and duplicate attestations are required when applicable. Any prescription edit invalidates the desktop review and acknowledgements.

## Persistence and retries

Use a stable UUID for each issuance attempt. A per-request MySQL lock and a unique `(doctor_user_id, issuance_request_id)` index prevent concurrent duplicates. Equal normalized submitted content and acknowledgements return the existing result, even after token expiry or appointment completion. Different content with the same UUID returns HTTP 409 `REQUEST_CONTENT_MISMATCH`.

The transaction writes encrypted issue-time snapshots, ordered encrypted item details, review coverage and acknowledgements, and linked FEFO movements. External items dispense zero units. Clinic lines dispense their complete quantity; cancellation returns only actual allocations. Deadlocks retry the rolled-back transaction at most twice with the same UUID and full revalidation. PDF work starts after releasing the connection. Failure leaves the committed prescription available for PDF recovery without reissuing or dispensing again.

SHA-256 metadata has scope `prescription_payload_v2`: canonical recorded content, including snapshot identity, directions, safety and acknowledgements. Readers verify it before using the snapshot. This is a recorded-content integrity hash, not a PDF-file signature or regulatory certification. Existing handwritten signature enrollment is preserved.

V2 PDFs, protected verification, clinician history and mobile history use the recorded snapshot. V2 validity lasts through the stated calendar date in Asia/Manila; readers and the expiry worker share that boundary. Public verification displays masked identity, prescriber, dates and server-reported status, with no medication details or external QR-generation request. It prints a verification summary, not a dispensing prescription. Stored legacy PDFs are unchanged; regenerated legacy documents display missing fields as **Not recorded** and do not parse old free text. Legacy external POSTs return `UPDATE_REQUIRED`; legacy clinic submissions remain supported without silent severe overrides.
