# Server Policy

Super Admins use the desktop **Server Policy** tab to preview and save rate limits, no-show grace, clinic hours, lunch, slot spacing, capacity, the medical recovery buffer, and appointment reminder times. Capacities use 60-minute blocks. Appointment type names and role modes come from `appointmentRules.js`.

The API exposes `GET /api/admin/server-policy`, `POST /api/admin/server-policy/preview`, and `PUT /api/admin/server-policy`. Preview and save accept the loaded `version` and the complete set of sparse `overrides`. A `409` requires a reload. Effective values use saved overrides, then environment defaults for limits and code defaults for appointment rules and reminder times. **Use baseline values** prepares an empty override set for review and save.

Startup loads the singleton `SERVER_POLICY` row before opening the listener. Migration 001 creates and seeds the table on older schemas before policy loading. An unavailable database or invalid persisted policy stops startup. Database Studio omits this table. Saves lock the row, check its revision, and commit the change and audit entry in one transaction. The committed revision becomes active in the API process.

New rate-limit windows use the saved duration. Active windows keep their expiry and use the current attempt cap on the next request. The no-show worker reads the active grace on each cycle. Existing appointments stay booked and count toward new capacity. Slot listing and booking share schedule and capacity rules. Booking holds a shared policy lock and serializes capacity checks by practitioner. Clinic times use the server's local scheduling clock, which should agree with MySQL's appointment clock.

## Appointment reminders

Super Admins can set one to five distinct lead times from 15 minutes to 7 days before the visit. `appointmentReminderLeadMinutes` stores whole minutes and defaults to `[1440]` (24 hours). Use **Preview changes** and **Apply server policy** to save. The worker reads the policy every 15 minutes without a restart.

New times apply to upcoming scheduled visits and can make a reminder due on the next check. If several times are already due, the worker sends one email for the most recent due time. Once SMTP accepts a reminder, only a shorter lead time can send for that appointment. An appointment with the old sent flag counts as having received the 24-hour reminder. The first accepted reminder also triggers a best-effort Firebase push and live event for the booked patient. Further reminders use email only.

## Send a test email

Choose a confirmation, reminder, or cancellation sample in **Send a test email**. Select saved addresses from the optional `SMTP_TEST_RECIPIENTS` setting in `server/.env`, enter an address manually, or combine both for up to five recipients. Each address receives a separate message with a `[TEST]` subject and synthetic details. **Accepted by SMTP** reports that the mail server accepted the message for delivery. [SMTP setup](../../../README.md#appointment-email)

`GET /api/admin/server-policy/email-test` returns `{ smtpConfigured, recipients }`. `POST` to the same path accepts `{ template, recipients }`, where `template` is `confirmation`, `reminder`, or `cancellation`, and returns `{ results: [{ address, accepted }] }`. Both endpoints require Super Admin access.

Run `node --test tests/serverPolicy.test.js tests/appointmentEmails.test.js` from `server/` for policy and email checks.
