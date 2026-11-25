# Responder history and incident documentation

Desktop staff can open **Alert history** and **Incident reports** from the sidebar. Reports have **Needs report**, **My drafts**, and **Filed** views. Mobile responders have **Alerts**, **History**, and read-only **Reports** with **Pending** and **Filed** views. Community qualified responders retain active-alert access only.

A resolved incident remains in the shared worklist until a report is filed. Reports older than 24 hours receive an attention flag; this is an age indicator, not an institutional reporting deadline. False alarms appear in history without requiring a report. Pending work and drafts default to all time; history and filed reports default to the last 30 Philippine calendar dates.

## Desktop drafts and filing

Report forms exist only on desktop. The editor autosaves changed text after 800 ms of inactivity and shows save/retry status. **Save and return** saves text and deferral metadata before closing. Escape and the close control use the same path. A failed save retains text; leaving without the latest changes requires an explicit choice.

Drafts are private to their author, encrypted using the existing AES-GCM vault, and available in that author's other desktop sessions. Every save supplies the current revision. A conflicting revision returns 409 `DRAFT_REVISION_CONFLICT`; the editor keeps local text and offers copying it or explicitly replacing it with the saved version. A draft is not an official incident report.

Filing retains the existing alert-row lock and one-report-per-alert constraint. Creating the report, deleting all associated drafts, and auditing the report commit together. Concurrent filing returns 409 `REPORT_ALREADY_FILED` to the losing caller. Filed reports remain read-only. PDF generation and recovery remain separate from successful filing.

Mobile contains no report editor or report-writing service methods. Pending summaries indicate **Complete this report in the desktop app** and whether the viewer has a desktop draft. Mobile never retrieves private draft text.

## API and access

All new routes below are under `/api/emergency` and require authentication plus live clinical responder access. Community accounts cannot use them. Filed-report reads also check live ADMIN membership and `INCIDENT_RECORDS_VIEW`; a Limited Admin's other clinical roles do not bypass that grant. Non-admin clinical responders may review filed reports. Administrator archive reads additionally require active staff responder authorization; patient-owned document access remains independent. Qualification is defined in the [appointment workflow](RESPONDER-QUALIFICATIONS.md).

| Method and path | Purpose |
|---|---|
| `GET /history` | Paged closed alerts: resolved and false alarms |
| `GET /history/:alertId` | Incident metadata and recorded activity timeline |
| `GET /report-summary` | Outstanding, over-24-hour and author-draft counts; filed-access capability |
| `GET /report-worklist` | Paged outstanding documentation; `view=drafts` selects the author's drafts |
| `GET /reports` | Paged filed report summaries |
| `GET /reports/:reportId` | Filed narrative, handover notes and author |
| `GET /reports/:reportId/pdf` | Authorized PDF retrieval using existing storage/recovery |
| `GET /:alertId/incident-report-draft` | Author's draft or empty revision zero |
| `PUT /:alertId/incident-report-draft` | Save author draft with revision, text, resolution date and optional `defer` |
| `DELETE /:alertId/incident-report-draft` | Remove author draft with its current revision |

List queries accept `search`, `period=30|all|custom`, `from`/`to` (`YYYY-MM-DD`, inclusive Philippine dates), `status=all|resolved|false_alarm`, `limit` (1–100, default 25) and opaque `before`. Responses are `{ records, nextCursor }`. Cursors are tied to the view and search filters. Pending work sorts oldest first; other lists sort newest first, with IDs breaking timestamp ties. Search matches IDs, patient names/identifiers, locations and documenting staff; it does not decrypt draft narratives for search.

The legacy `/incident-reports/pending` response remains an array and includes unfinished incidents older than 24 hours. Existing archive array responses are unchanged. Details and PDFs load only on request. Responses use `Cache-Control: no-store`; clients retain session data in memory, cancel stale reads and clear protected views when access changes.

Draft operations and filing require the desktop's `X-Client-Instance-Id` UUID. This is a supported-client workflow marker, not device attestation; live server staff authorization remains mandatory. Do not treat headers or user-agent strings as proof of a trusted device.

Timelines use recorded alert timestamps and status-change audit entries. Missing historical actors or dispatch events are not invented. Reads use PHI access logging. Draft write audit entries contain operation/revision/deferral metadata without narrative text. `emergency:report_work_changed` carries only an alert ID to the author, or clinical staff when work is explicitly deferred; filing retains `emergency:incident_reported`.

## Deployment and checks

Deploy migration **015** and the server before new clients. It adds `INCIDENT_REPORT_DRAFTS` and history/worklist/audit indexes without rewriting filed reports. Fresh installs use the updated schema. Run `npm run migrate` for an existing installation; never rerun the schema against existing data.

Run server responder-history/access tests plus migration/concurrency rehearsals against disposable MySQL, `flutter test` and `flutter analyze` in mobile, and desktop `npm test`, `npm run build`, and `npm run test:layout`. The hidden UI fixture exercises autosave during edits, save failures, deferral/resume, revision conflicts, single filing, read-only review, lazy PDFs, search and archive revocation.
