# Responder qualification API

[Workflow and deployment](RESPONDER-QUALIFICATIONS.md)


All paths below have the prefix `/api/responder-qualifications` and require authentication with live account/authority checks.

| Method/path | Purpose |
|---|---|
| GET `/me` | Own applications, appointments, notices, actor capabilities and rollout state |
| GET `/applications?before=id` | Reviewer/admin queue; 100 records per page and `nextCursor` |
| POST `/applications` | Own draft, or authorized nomination using `userId`; `requestedLevel`, `affiliation`, `trainingHistory` |
| GET `/applications/:id` | Authorized detail, evidence and decision history |
| PATCH `/applications/:id` | `revision` and action: save, accept_nomination, submit, withdraw, start_review, needs_information, training_required, save_assessment, approve, reject |
| POST `/applications/:id/evidence` | Multipart `file`; editable applicant draft or active reviewer assessment |
| GET `/evidence/:id` | Protected attachment download |
| GET `/candidates?q=text` | Authorized nomination/reviewer candidate search |
| GET `/reviewers` | Administrator reviewer roster |
| PUT `/reviewers/:id` | Administrator designation/removal using `isActive` |
| POST `/appointments/:id/end` | Suspend/revoke with `status` and mandatory `reason` |
| POST `/enable` | Administrator cutover; requires an approved active staff roster |

Reviewer actions require `start_review` from `submitted` before any assessment save, decision or reviewer evidence upload. Assessment saves and decisions against `submitted` return 409; repeated `start_review` against `under_review` returns 409. Reviewer evidence uploads require `under_review`; authenticated inspection/downloads remain available before review. Applicant resubmission returns to `submitted` and requires review to be started again. These checks are server-enforced and preserve the existing revision checks.

`GET /api/emergency/responder-access` retains `authorized`, `tier`, `isQualifiedResponder` and adds `appointmentStatus`, `appointmentLevel`, `expiresAt`, `qualificationEnforced`. Authorization always checks appointment validity live. Background worker delay cannot extend access. Client expiry timers clear cached operational views. The old PUT `/api/admin/users/:id/qualified-responder` returns 409 `QUALIFICATION_WORKFLOW_REQUIRED`; account creation/editing cannot grant access.

