# Server Policy

Super Admins use the desktop **Server Policy** tab to preview and apply rate limits, no-show grace, clinic hours, lunch, slot spacing, capacity, and the medical recovery buffer. Capacities use 60-minute blocks. Appointment type names and role modes come from `appointmentRules.js`.

The API exposes `GET /api/admin/server-policy`, `POST /api/admin/server-policy/preview`, and `PUT /api/admin/server-policy`. Preview and save accept the loaded `version` and the complete set of sparse `overrides`. A `409` requires a reload. Effective values use saved overrides, then environment defaults for limits and code defaults for appointment rules. **Use baseline values** prepares an empty override set for review and save.

Startup loads the singleton `SERVER_POLICY` row before opening the listener. On an older schema it creates and initializes the table. An unavailable database or invalid persisted policy stops startup. Database Studio omits this table. Saves lock the row, check its revision, and commit the change and audit entry in one transaction. The committed revision becomes active in the API process.

New rate-limit windows use the saved duration. Active windows keep their expiry and use the current attempt cap on the next request. The no-show worker reads the active grace on each cycle. Existing appointments stay booked and count toward new capacity. Slot listing and booking share schedule and capacity rules. Booking holds a shared policy lock and serializes capacity checks by practitioner. Clinic times use the server's local scheduling clock, which should agree with MySQL's appointment clock.

Run `node --test tests/serverPolicy.test.js` from `server/` for policy and scheduling checks.
