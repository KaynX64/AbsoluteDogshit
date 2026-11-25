# Desktop responder qualifications

`QualificationWorkspace.tsx` coordinates the shared workspace across Doctor, Dentist, Nurse, Admin and Responder navigation. Authority comes from the server's actor capabilities, never the displayed role. The sidebar label always has two lines so selected font weight cannot change its height.

## Layout and actions

At 1024 × 700 and above, the application list and detail body scroll independently. The heading, view tabs, application identity and editing/review actions stay visible. Narrow/short windows use the flowing layout; narrow screens stack the list above the detail. Application details, evidence, assessments, appointment management and decision history share consistent section spacing. Completed applications show readable values instead of disabled applicant inputs.

The workspace and management dialog use the shared `--font` family with regular body text, medium labels and semibold controls. Body copy is 15px, controls and form labels 14px, secondary text 13px and compact badges/dates at least 12px. The page title is 28px (24px in narrow windows), application identity 22px and section headings 16px. Segmented view tabs, two-line application cards and padded detail sections establish the same hierarchy across roles. Assessment checkboxes are grouped into eligibility and practical competencies. Forms and check groups stack according to the detail pane's available width, rather than squeezing two columns into a narrow pane.

Read/save feedback uses the page subtitle slot, leaving more height for records without a separate empty feedback row. Routine one-line updates retain the header height. Demo records use a small informational label; warnings and clinic feedback retain their stronger notice treatment.

Application cards align the name and reference on the first row, with an unpadded status indicator and date beneath. Selection uses a subtle tint and a narrow leading accent, without a chevron or heavy double outline. Long names and statuses wrap within the card; dates keep a consistent right alignment.

Evidence, decision history and each event's recorded evidence/decision are always displayed as regular sections, without disclosure controls. Empty evidence/history show an explicit message. Long event records flow in the main detail scroller rather than a nested scroll box.

Appointment management keeps a 12px vertical gap between the reason field and Suspend/Revoke actions, including when the textarea is resized or focused.

History uses a vertical timeline with an event title, actor and date in each entry. Decision notes lead the entry; application and assessment snapshots use labelled facts with flat section separators. Eligibility and competency checks use aligned Yes/No rows; assessment results use a compact status badge. These same readable values replace disabled assessment forms on completed records. Missing values show Not recorded; JSON and internal field names are not rendered. Synthetic records keep a small demo label. All details remain visible without expanding a section.

The own view selects an open application first. Selection and search/status filters are retained separately for each view. Nominations, reviewer designation and roster cutover use `QualificationManagement.tsx` in a shared Dialog; expanding management tools never resizes the application pane. Review decisions require an explicit action after choosing the outcome. Existing confirmation and server authority checks remain in place.

## Reads, drafts and refresh

Submitted applications allow read-only inspection. Eligible reviewers see **Start review** as their only review action; assessment fields stay disabled and reviewer uploads/decisions are unavailable. After the server confirms **Under review**, assessment editing, Save assessment and decisions become available. Every applicant resubmission requires Start review again. Administrator oversight alone never enables these actions.

`useQualificationRecords.ts` owns one page-local `RecordPageCache`: at most eight entries with 15-second freshness, shared pending reads and aborted obsolete requests. Overview reads retrieve the review queue/reviewer roster in parallel after checking capabilities. Focus and qualification/reconnect events refresh visible data without replacing it with a loading screen. Explicit refreshes coalesce; failures retain readable content and offer retry. Access denial clears protected snapshots. Unmount clears the cache.

Drafts live in workspace memory per application. Switching local views or refreshing does not overwrite edits. Starting review preserves any retained local assessment draft without saving it, and saving assessment preserves the pending decision rationale. Each draft retains its starting revision; conflicts keep local text and offer an explicit, confirmed reload of the latest saved version. Mutation failure retains the draft. Leaving the qualifications workspace clears unsaved local drafts; use Save draft before navigating elsewhere. Evidence downloads and candidate searches do not reload all qualification records. No records or drafts are stored in browser storage.

Only deliberate view/application selection starts selection motion. Background refresh and typing do not restart it. The shared motion helper respects reduced-motion settings.

## Verification

Run `npm run build` and `npm run test:layout -- --qualifications-only`; add `--dark` for dark mode. The isolated fixtures exercise assessment/approval, revocation, refresh coalescing and failure/retry, preserved drafts, late detail responses, cached selection, sidebar dimensions and all five role layouts at large, compact and narrow sizes. Screenshots are written to ignored `dist/compact-clinic-checks/qualifications-*.png` files.
