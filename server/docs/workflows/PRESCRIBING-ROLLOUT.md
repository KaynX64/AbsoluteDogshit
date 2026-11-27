# Structured prescribing rollout and checks

See the [API contract](STRUCTURED-PRESCRIBING.md) and [migration procedure](../migrations/MIGRATION-PLAN.md). The flag defaults to off. Do not enable it until the updated readers and clinician workflow have been reviewed.

## Deployment order

1. Back up the deployment and rehearse migration 013 on a disposable copy. It adds encrypted snapshot and item payload columns, ordering, contract version and request UUID/hash; widens prescribed supply quantities to DECIMAL(12,3); permits nullable course duration; and adds the clinician/request unique index. It does not infer or backfill historical clinical values.
2. Deploy the server and updated prescription readers with `STRUCTURED_PRESCRIBING_ENABLED=false`. Startup applies migrations before listening. Never run `schema.sql` against an existing deployment.
3. Release the updated desktop and mobile together. Check desktop capability detection. An unavailable/disabled server keeps issuance disabled with an explicit message. Older external-prescription clients receive `UPDATE_REQUIRED`.
4. Have the clinic clinician/pharmacist review representative manual, catalog-backed external, clinic, mixed, PRN/custom, liquid and container forms and printed prescriptions. This release has no dosing engine, external pharmacy integration or specialized controlled-drug workflow.
5. Enable `STRUCTURED_PRESCRIBING_ENABLED=true` on the server and restart using the normal deployment process. Check issuance, patient history and QR/PDF access with authorized test accounts. Turning the flag off stops new v2 reviews/issuance while retaining readers and legacy records. Do not roll the schema backward over issued v2 records.

## Automated checks

From `server/`, run `node --test`. Opt into real MySQL migration and transaction tests using a **disposable MySQL 8 instance**, never the deployment database:

```powershell
$env:VALETUDO_MIGRATION_TEST_PORT = '<disposable-loopback-port>'
$env:VALETUDO_MIGRATION_TEST_PASSWORD = '<disposable-root-password>'
node --test
```

Tests create randomly named databases and drop them during teardown. `structuredPrescribing.test.js` covers manual/known identities, validation, review binding, interaction failures/overrides, mixed ordering, concurrent UUID retries, shortages, transactional rollback, cancellation, immutable readers and PDF failure/recovery. `migrations.test.js` covers fresh, legacy and interrupted migration runs. Database Studio classifies both new clinical payloads as encrypted for writes and audit fingerprints.

`prescriptionDates.test.js` checks Manila midnight, leap/year boundaries, cancellation precedence and SQL DATE inputs across deployment timezones. The expiry worker uses the same clinic calendar for v2 records. `publicVerificationPage.test.js` executes the landing-page renderer with public responses, including invalid tokens, escaping and server-reported cancelled/expired status. The public prescription page contains no medication fields or fallback doses, makes no external QR-generation request, and prints only a verification summary.

From `desktop/`, run `npm test`, `npm run build` and `npm run test:layout`. The layout check launches a hidden Electron renderer with synthetic data and blocked external network. It exercises conditional forms at 1024×720, 1280×720, 1366×768 and 1920×1080, component scrolling, multiple medicines and Dentist chart containment. Screenshots are written under ignored `dist/compact-clinic-checks/`.

From `mobile/`, run `flutter test` and `flutter analyze`. Recorded-item tests cover absent legacy data, fractional units, course/review dates and the patient preview. Existing appearance, session, downloads and performance coverage stays enabled.

For PDF review, run `node scripts/render-prescribing-fixtures.js` from `server/`, then render the two synthetic PDFs under `output/pdf/` with Poppler. Inspect every page for readable units/directions, intact ordinary medication rows, continued patient/prescription identification, QR contrast and signatures. Unusually long recorded text may continue across pages with repeated identification. Existing PDFs are served unchanged.

## Manual acceptance before operational use

- Select a zero-stock catalog medicine for external fulfillment and confirm no clinic stock movement. Switch an item to eligible clinic inventory and confirm full-unit FEFO deduction. Mix both sources without regrouping items.
- Add, reorder and remove medicines. Switch Documents/Encounter and document subtabs; retain the active patient draft. Changing patient starts a different draft. Drafts remain in session memory and disappear when their workspace/session ends.
- Return from review and verify entered fields survive. Change any clinical field, validity or patient advice and confirm acknowledgements reset. Test a contraindicated pair, each severe override, duplicate generic names, absent rules and a manual identity. Never treat the result as a full safety check.
- Disconnect during issuance and retry the retained request. Until its outcome is resolved, the desktop holds the exact submitted body and UUID. Confirm one prescription and one set of stock movements. Definitive validation errors leave the draft available for correction.
- Revoke signer access, remove the signature, complete the appointment, change catalog identity/rules, or consume stock between review and issue. The server must reject the stale/ineligible request without partial writes.
- Compare review with protected history, patient preview and the generated PDF. Edit catalog metadata after issue and regenerate a missing PDF; recorded content must remain unchanged. Test a sparse legacy record without introducing fallback dosing instructions.
- Verify authorization and patient consent gates, cancellation returns, expired status, protected PDF recovery, and privacy-minimizing public QR responses. Confirm that enlarged text or windows below compact thresholds retain an accessible scrolling fallback.

Automated fixtures cannot establish clinical suitability or deployment readiness. The clinic review and real printer/device checks remain deployment responsibilities.
