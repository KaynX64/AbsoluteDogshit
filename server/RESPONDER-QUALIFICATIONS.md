# Campus responder qualifications

HealthLink records university approval for defined campus response duties. **Qualified Responder** is an institutional designation, not an assertion of external certification. Campus-supervised training and practical assessment may establish competency. Attendance alone does not qualify someone.

## People and access

- Applicants can apply themselves or accept a nomination, provide evidence, submit corrections, withdraw, and request renewal. Nominations require the applicant's acceptance and agreement to responsibilities before submission.
- Designated, active **nurses or doctors** review applications and record assessments. Administrators assign these reviewers independently of SOS appointments. Reviewers cannot assess or approve themselves.
- Administrators with **RESPONDERS_MANAGE** (including Super Admins) inspect all qualification records, nominate accounts, designate reviewers, suspend/revoke appointments and enable the reviewed roster. Administrator authority alone cannot approve an application.
- An active **community** appointment permits reduced incident details, navigation and acknowledgment. An active **staff** appointment plus a live NURSE, DOCTOR, DENTIST or EMERGENCY_RESPONDER role permits medical incident details, dispatch, closure, history and reports. ADMIN alone grants neither level after cutover. Existing incident archive grants still apply to administrator accounts.
- Duty mode is separate from qualification. Qualification does not alter On duty, Quiet or Off duty behavior.

## Workflow

1. Open **Responder qualifications** in the desktop sidebar, or **Account settings → Responder qualification** on mobile. Applicants create a draft with campus affiliation, requested level and training history or a request for campus assessment. Reviewers and administrators can nominate an existing account from the desktop workspace.
2. The applicant agrees to responder responsibilities and submits. Only one initial/renewal application may be open per account. Submission locks applicant edits while the clinic reviews it.
3. Submitted applications are read-only for reviewers until **Start review** changes them to **Under review**. Only then can a reviewer attach assessment evidence, record an assessment, request information/training, reject or approve. Starting review records the reviewer and notifies the applicant; it does not save assessment fields or reserve the application exclusively. Requests for information/training reopen applicant editing; every resubmission requires a fresh **Start review** step.
4. Approval requires verified identity and affiliation, completed campus orientation, a passed assessment, every competency checked, an assessor/date/method/notes and rationale. The competencies cover scene safety, escalation, first aid, BLS, privacy/boundaries and app use. Clinical staff duties additionally require professional credential verification.
5. Approval creates a 12-month appointment, shortened by any credential explicitly required for the decision. Assessment dates follow Asia/Manila; credential expiry dates are exclusive midnight boundaries in that timezone. Renewals stay separate until approved, preserving the current appointment. A successful renewal replaces the previous appointment and retains its history.
6. Suspension, revocation, account inactivity, loss of a required staff role or expiry ends operational access. Restoration requires a new clinic approval. Decisions and evidence history remain available. Durable in-app notices cover decisions and renewal reminders at 30 and 7 days; connected devices receive refresh events. Missed reminder windows deliver the applicable remaining-window notice on the next worker run.

Application states: draft, submitted, under_review, needs_information, training_required, approved, rejected, withdrawn. Appointment states: active, suspended, expired, revoked. Changes require the current application revision; conflicting decisions return 409. The server serializes qualification mutations, including reviewer removal and cutover, in a transaction.

Evidence belongs to qualification records, not patient EMRs. Up to ten PDF/JPEG/PNG files of 5 MB each can be attached. Content signatures must match the declared type. Files use authenticated downloads and AES-GCM encryption before object storage. Owners, designated reviewers and authorized administrators can read them. Qualification tables are excluded from Database Studio and cannot be edited through its generic writes.

## API

See the [qualification API contract](RESPONDER-QUALIFICATION-API.md) for endpoints, actions and compatibility fields.

## Deployment and synthetic scenarios

Migration **017** adds seven qualification tables and imports existing flags/staff as draft candidates. It fabricates no approvals. Existing installations begin with enforcement disabled, explicitly preserving legacy delivery during roster preparation. Designate clinic reviewers, complete the operational roster and deploy the updated clients before an authorized administrator selects **Enable reviewed roster**. There is no UI/API switch back to legacy access.

Fresh-install `schema.sql` includes synthetic development scenarios. For this existing development database, use:

```powershell
cd server
node scripts/seed-responder-qualifications.js --development-fixture
```

The explicit fixture rejects production mode and checks account identities before changing anything. It keeps **Daniella (5)** approved at community level and **Rachelle (12)** submitted, awaiting assessment. Demo nurse/doctor reviewers and an approved operational staff roster make the demonstration usable. Every fabricated assessment/decision is labelled **Synthetic demo data**; no external certificates or real professional verification are claimed. It changes no passwords, identities or roles. Existing genuine applications are not overwritten; repeat runs do not duplicate or restore ended fixture appointments.

Verification: `node --test tests/responderQualification.test.js tests/responderAccess.test.js`; set `VALETUDO_MIGRATION_TEST_PORT` for `tests/responderQualification.integration.test.js`. The integration test creates/removes its uniquely named disposable database and tests lifecycle, concurrent decisions, private encrypted evidence, renewal, expiry and fixture repeatability.
