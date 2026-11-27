# HealthLink — codebase review

Reviewed on 2026-11-15. See [the overview](../architecture/CODEBASE-OVERVIEW.md) for architecture and workflows. This assessment is based on targeted source inspection and the checks below.

## Assessment and next priorities

The code has substantial workflow depth: shared domain transactions, versioned migrations, permission-scoped analytics, audit trails, encrypted clinical text, PDF recovery and offline replay. Passwords use bcrypt, sessions use JWTs, and TLS is the default. These controls express the project's privacy goals; they do not establish legal compliance by themselves.

The main maintenance priorities are:

- **Large UI controllers:** DoctorConsole, AdminConsole and PatientPortal each exceed 120 KB. Continue extracting focused behavior and components as related changes arise. Keep code-slice maps synchronized.
- **Deployment coordination:** desktop API configuration is bundled at build time; mobile has a source-configured host; generated document links use server `PUBLIC_API_BASE_URL`. Host and certificate settings must agree across clients.
- **Documentation drift:** historical Stage1 notes, mixed branding and duplicated configuration facts can mislead changes. Prefer current module guides and source; update affected Markdown with implementation changes.
- **Degraded security behavior:** Redis outages let the API continue, but JWT denylist checks are skipped when Redis is unavailable. Operational availability therefore changes revocation guarantees.
- **Verification gaps:** server tests include API contracts and optional disposable-MySQL concurrency/migration coverage; desktop tests cover native boundaries and offline storage. Mobile now tests account-theme persistence, isolation, offline recovery, refresh races, contrast and settings navigation alongside its app smoke test. Full device, deployment and database testing remains separate from this walkthrough.
- **Tracked key material:** `server/server/certs/key.pem` is tracked outside the documented runtime certificate directory. Its use was not established in this review. Establish ownership and deployment history before deciding cleanup or rotation.

Use [the server structure review](../../server/docs/reviews/STRUCTURE-REVIEW.md) for backend ownership decisions and [documentation maintenance rules](../agent-guidance/AGENTS-02.md#documentation-maintenance--part-of-every-change) for future changes.

## Checks performed

- Backend: the account-theme change passed all 20 mounted API tests, including authenticated preference reads and shared desktop/mobile writes. The earlier architectural baseline had 127 passed and 29 skipped. Optional disposable-MySQL suites were not exercised. API tests needed localhost access outside the sandbox.
- Mobile: all 18 tests pass, including booking contrast in all six appearances, themed date-picker checks, enlarged-text settings navigation and repeated mode/palette changes while the same popup stays open. The popup test reproduced a stale route background before the fix and now verifies the painted surface and heading contrast from both initial modes. Generated booking/time/settings previews were inspected in all three dark palettes. Dart analysis of `lib` and `test` is clean. Flutter tests required SDK cache access outside the workspace.
- Desktop: the earlier `npm.cmd test` baseline passed all 8 tests. Desktop code was not changed by the mobile-theme implementation.
- Documentation: checked edited Markdown for whitespace errors, relative file targets and the 7 KB size convention.
- Slice maps: updated the affected mobile ranges and checked both desktop/mobile maps with an equivalent Node implementation of the existing verifier's bounds, overlap and literal-anchor rules. Python was unavailable on PATH for the Python command.
- Not run: builds, packaged desktop smoke tests, live-device workflows or external services.

The initial walkthrough changed documentation only. The subsequent mobile account-theme implementation reuses existing account preference columns and does not change runtime configuration or the database schema.
