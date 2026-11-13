<!-- split from README.md — part 08 of 08 -->

## 8. Tests & Documentation Verification

`server/tests/` on `Stage1` contains seven files:

```
analyticsStats.test.js
bmi.test.js
cryptoVault.test.js
dbStudioGuard.test.js
incidentReportPDF.test.js
responderAccess.test.js
signatory.test.js
```

`reencrypt.test.js` is gone; the admin health-profile commit updated tests for the current encryption model and added test env variables. Check `server/package.json` for the current test script; a direct fallback from `server/` is:

```bash
node --test tests/*.test.js
```

Also run the normal client checks:

```bash
cd desktop && npm run build
cd mobile && flutter pub get && flutter analyze
```

### Verify code-slice documentation

`scripts/verify_codeslice.py` reads Markdown slice maps. From its docstring:

- Table rows are `| # | A-B | anchor | description |`; headings map a file ID such as `DT-08` or `MB-07` to a source path.
- It checks `1 <= A <= B <= line count`, ascending/non-overlapping slices per file ID/path, and that the anchor string literally appears inside source lines `[A, B]`.
- Rows with an empty, hyphen, en-dash or em-dash anchor are structural filler and skipped.
- Missing source files and Markdown files with no parsed rows fail.
- A directory argument expands to its sorted top-level `*.md` files, so a `codeslice/` directory can validate every per-monolith map at once; maps split over the 7 KB documentation cap live in `<name>-parts/` sub-directories and are reassembled in numeric order before checking.
- Exit code `0` means all files are OK.

Run it from the repository root with the `CODESLICE.md` files or the `codeslice/` directories as arguments, following the usage line in the script. Rerun it after **any** source edit that changes line numbers.

---

## 9. Pre-merge Checklist (Stage1 → main)

1. **Resolve `README.md` deliberately.** `main` HEAD `d7b23ba` has a 25,491-byte project README; `Stage1` has a 3,170-byte `AGENTS.md Pack` note with different content. Replace the `Stage1` README with this file or merge the two intentionally — do not let an automatic resolution silently discard the project documentation.
2. **Update the stale schema count.** `server/schema.sql` on `Stage1` lists 30 tables including `INCIDENT_REPORTS`, while root `AGENTS.md` still says “29-table schema”. Update root `AGENTS.md`, `server/AGENTS.md` and any route/table maps that mention incident-report endpoints.
3. **Update the AGENTS-pack description.** The current root README says “four instruction files”; the tree actually has root + three module + three nested `AGENTS.md` files. Keep the token-efficiency rule (only decision-dense trees carry instructions), but describe the real layout.
4. **Confirm dependency cleanup.** `Stage1` includes `chore: untrack server node_modules`. Before merging, run `git ls-files | grep node_modules` and verify no `node_modules/` directory is tracked.
5. **Validate the new schema/migrations on a fresh DB.** `schema.sql` is destructive. Back up `ENCRYPTION_KEY`/`ENCRYPTION_SALT` before any PHI migration, then verify `INCIDENT_REPORTS`, `HEALTH_PROFILES.sex/date_of_birth/bmi`, `PRESCRIPTIONS.expires_at` and `PRESCRIPTION_ITEMS.quantity_prescribed` exist after boot.
6. **Run the verification set:** backend tests, `npm run build`, `flutter analyze`, and `scripts/verify_codeslice.py` against both `codeslice/` directories.
7. **Re-check deployment values:** `PUBLIC_API_BASE_URL`, `CORS_ALLOWED_ORIGINS`, `desktop/app-config.json`, `mobile/lib/config/api_config.dart`, SMTP/Firebase credentials and self-signed certificate policy. Development credentials in `docker-compose.yml` are not production secrets.
8. **Keep generated/vendor trees free of agent instructions** — no `AGENTS.md` in `node_modules/`, `dist/`, `release/`, lockfiles or Flutter platform build outputs.

Exact REST endpoint paths are intentionally not enumerated here: the route modules are large and only partially inspected. Use `server/src/routes/`, `server/AGENTS.md` and the Postman collections as the authority for endpoint-level details.

### License

GNU General Public License **v2.0** — see [`LICENSE`](../LICENSE).
