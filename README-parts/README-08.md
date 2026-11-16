<!-- split from README.md — part 08 of 08 -->

## 8. Tests & Documentation Verification

Run each module's checks from its own directory.

| Directory | Commands |
| --- | --- |
| `server/` | `node --test`. Set `VALETUDO_MIGRATION_TEST_PORT` to include isolated MySQL migration and concurrency tests. [Migration rehearsal](../server/MIGRATION-PLAN.md#rehearsal-and-recovery) |
| `desktop/` | `npm test` and `npm run build`. Run `npm run dist` on Windows before `npm run test:smoke`. [Desktop verification](../desktop/README.md#verification) |
| `mobile/` | `flutter pub get`, `flutter analyze` and `flutter test`. [Mobile build and test](../mobile/README.md#build-and-test) |

### Verify code-slice documentation

`scripts/verify_codeslice.py` reads Markdown slice maps. From its docstring:

- Table rows are `| # | A-B | anchor | description |`; headings map a file ID such as `DT-08` or `MB-07` to a source path.
- It checks `1 <= A <= B <= line count`, ascending/non-overlapping slices per file ID/path, and that the anchor string literally appears inside source lines `[A, B]`.
- Rows with an empty, hyphen, en-dash or em-dash anchor are structural filler and skipped.
- Missing source files and Markdown files with no parsed rows fail.
- A directory argument expands to its sorted top-level `*.md` files, so a `codeslice/` directory can validate every per-monolith map at once; maps split over the 7 KB documentation cap live in `<name>-parts/` sub-directories and are reassembled in numeric order before checking.
- Exit code `0` means all files are OK.

Run it from the repository root after editing a mapped source file.

```sh
python scripts/verify_codeslice.py desktop/docs/codeslice mobile/lib/screens/codeslice .
```

---

## 9. Pre-merge Checklist (Stage1 → main)

1. Run the applicable module checks and verify affected code-slice maps.
2. Rehearse schema changes on a disposable database and use the versioned migration runner for existing installations. [Migration rollout guide](../server/MIGRATION-PLAN.md)
3. Before deployment, check the API and document-link URLs, browser origins, certificate trust and integration credentials for the target environment. [Configuration](README-07.md#7-configuration)
4. Update affected guides and keep generated output and local credentials out of the change. [Documentation maintenance rules](../AGENTS-parts/AGENTS-02.md#documentation-maintenance--part-of-every-change)

### License

GNU General Public License **v2.0** — see [`LICENSE`](../LICENSE).
