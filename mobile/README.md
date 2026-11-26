# LeoVital HealthLink mobile app

Flutter app for patients and emergency responders. Module-specific architecture, platform, and security guidance lives in [AGENTS.md](./AGENTS.md); repository-wide setup is in the root [AGENTS.md](../AGENTS.md).

## Configure and run

Start the API and run Flutter from `mobile/`. For a physical Android phone, put it on the same network as the API host and pass the host’s LAN IP. Replace the example IP with the IPv4 address shown by `ipconfig` on the Windows API host. The standard Android emulator uses `10.0.2.2` to reach the development host.

```powershell
flutter pub get
flutter run --dart-define=API_BASE_URL=https://192.168.1.10:5000
# Android emulator
flutter run --dart-define=API_BASE_URL=https://10.0.2.2:5000
```

`API_BASE_URL` is the HTTPS origin, including the port when needed. The app uses it for HTTP and realtime connections. Stop and rerun Flutter to apply a different origin.

If sign-in cannot reach the server, open `/api/ping` at the configured origin from the phone. A timeout points to the server or network path. Check that the API is listening and that the LAN and Windows firewall allow the connection. If sign-in reports a secure connection failure, check the certificate chain and confirm that it covers the exact DNS name or IP used by the app.

For USB-connected Android development with USB debugging enabled, forward the phone’s API port to the host and use the phone’s loopback address. Repeat `adb reverse` after reconnecting if the tunnel is gone.

```powershell
adb reverse tcp:5000 tcp:5000
flutter run --no-pub --dart-define=API_BASE_URL=https://127.0.0.1:5000
```

## Build and test

```powershell
flutter test
flutter build apk --release --dart-define=API_BASE_URL=https://clinic-api.example.org
```

Use the deployment’s actual API origin and a certificate chain the app trusts. The self-signed `localhost` certificate used for local development requires a debug build when connecting to it by LAN IP. See [AGENTS.md](./AGENTS.md) for TLS and Firebase setup.

Do not commit Firebase service-account or `google-services.json` credentials. Platform folders are generated; edit only the exceptions listed in [AGENTS.md](./AGENTS.md).

## Responsiveness and session data

Appointments and Documents reuse fresh data and retain their tab preferences, booking draft and scroll positions while you move around the portal. Available times are checked again when you open Appointments and confirm a booking. Pull down to refresh a list immediately. This memory is cleared when your session ends; it does not make clinical documents available offline.

See [performance behavior and verification](PERFORMANCE.md) for cache lifetimes, preloading and the Android profiling protocol.

## Booking an appointment

Choose your doctor or dentist, visit purpose, date and an available time, then add any optional notes. Tap **Review appointment** to see the care team, purpose, date, time, location and notes before booking. Choose **Edit details** to return to your saved selections, or **Confirm appointment** to submit. Closing the review also keeps your draft.

If availability refreshes during review, select a time again and review the updated details. If a slot is taken before submission completes, the app shows the server's message and refreshes available times. A successful booking shows the confirmation and a shortcut to **My appointments**.

When the clinic has email delivery configured, LeoVital sends a confirmation to the address on your account and can send reminders before the visit. To cancel an upcoming booking, open **My appointments** and choose **Cancel appointment**. LeoVital sends a cancellation notice after the booking is cancelled.

The review follows the account's appearance settings, scrolls for long notes and enlarged text, and keeps its actions accessible on small screens. Run `flutter test test/appointment_booking_review_test.dart` for the booking review, dismissal, submission, availability refresh and theme/text-size checks.

## Account settings

Tap the **Account settings** gear in the patient portal or responder header to open the bottom drawer. It keeps your current screen behind it and provides appearance controls and **Change password** together. Close it with the X, swipe it down, or tap outside. The patient Profile tab also has a direct password shortcut.

To end your session, choose **Sign out of portal** in the patient Profile tab or **Sign out** in the responder header, then confirm.

Under **Appearance**, choose **Light** or **Dark**, then a named **LeoVital**, **Blossom**, or **Sunrise** palette shown as two overlapping color circles, matching desktop. The drawer and app update immediately, including when switching modes while the drawer stays open. The drawer shows account-save status and offers **Retry saving** when needed. Choices scroll on small screens or with enlarged text.

**Change password** opens the existing password form. Back returns to the drawer. Use your current password and confirm the new one; after a successful change, sign in again with the new password.

Appearance saves to the signed-in account using the same preferences as desktop. Pending saves remain cached for that account and retry when connectivity returns or the app resumes. Saved selections survive restarts. Sign-in uses the default appearance, and the app checks for desktop changes on resume or reconnect.

## Responder Hub on Android

Dedicated responder accounts open the hub after sign-in. Other eligible accounts can open **Responder Hub** from the patient portal's health pass or profile. The hub lists active incidents and opens the details and actions available to your account.

Active alert cards show the person, status and reported location. **View details** and **Navigate** use equal-width buttons, with the next permitted response action below; narrow screens and enlarged text stack the buttons. Staff move from Acknowledge to Dispatch to confirmed Resolve; community responders may only acknowledge. False alarms stay in the detail view with confirmation. Triggered incidents retain individual mute controls. The separate compact alert strip stays red for every active status and shows only a brief status/location, mute when needed, and an action to open details.

- **On duty** enables automatic incident delivery and the in-app siren for a newly triggered incident. Background alerts use the audible Android notification channel.
- **Quiet** keeps automatic incident delivery with vibration and suppresses the in-app siren. Background alerts use the quiet channel.
- **Off duty** pauses automatic incident updates and background SOS delivery after the setting saves. Use **Refresh incidents** to check manually.

Allow Android notifications for background delivery. The hub shows when delivery settings are still syncing and offers **Retry delivery settings** after a failed save. Use **Test siren for 3 seconds** to check the in-app sound. For the server rollout, see [migration 012](../server/MIGRATION-PLAN.md#fresh-and-existing-databases).

Non-clinical **Qualified Responders** can view limited incident details, navigate to the scene and **Acknowledge** an alert. Acknowledgment keeps the incident active; it does not dispatch a team or close the emergency. Dispatch, Resolve, False alarm and official incident reporting are reserved for authorized response staff. After roster cutover, these actions require an active staff appointment and a live clinical/emergency staff role. ADMIN alone is not a responder.

Authorized response staff have **Alerts**, **History**, and **Reports** in the responder workspace. History and reports have search and date filters. Mobile reports are read-only: **Pending** shows unfinished documentation and **Filed** opens saved reports and PDFs. Pending items show **Complete this report in the desktop app** and any personal desktop draft indicator. Items older than 24 hours are highlighted and remain visible until filed. Report forms and draft editing are available only on desktop. Deploy migration **015** and the server first. [Workflow and access guide](../server/RESPONDER-RECORDS.md).

History and report filters use icon buttons with date/outcome selection sheets. They follow the account font, colors and text scaling. Loaded destinations and recent Pending/Filed results stay available while switching; refresh keeps existing cards visible. Hidden destinations defer network reads until opened. These bounded caches stay in memory and clear when access is lost or the workspace closes.

## Responder qualification

Open Account settings → Responder qualification to apply, accept a nomination, attach PDF/image evidence, track clinic feedback or request renewal. Campus-supervised assessment is accepted; external certificates are optional. Pending applicants receive no responder access. Renewal does not interrupt an existing valid appointment. Decisions and reminders appear in Notifications. [Complete process and rollout](../server/RESPONDER-QUALIFICATIONS.md).

## Emergency SOS and health pass

The SOS tab shows the complete campus SOS card first, followed by Call 911 and emergency contact call/text actions. SOS call and text actions are available independently of GPS and internet access. A submitted SOS is queued for its signed-in account and retried when the app opens, resumes, or reconnects. **Accepted by server** confirms that the server saved the request. Pending requests that reach 15 minutes expire instead of sending old coordinates. Previous device-wide queues have no reliable account owner and are excluded from replay. Deploy [migration 014](../server/MIGRATION-PLAN.md#fresh-and-existing-databases) before releasing this app.

The health pass refreshes when the Overview is visible and its current QR expires. A pass can be scanned once. Use **Refresh pass** when the front desk needs to scan it again.

## Recorded prescriptions

Documents previews show recorded preparation, dose/route, schedule, course or review date, supply units and directions. External items are not dispensed by the infirmary. Missing historical details display **Not recorded**. The downloaded PDF remains the issued document. See the [prescribing rollout](../server/PRESCRIBING-ROLLOUT.md).

Documents show the current server status and use the same public verification URLs as the issued PDFs. If a list fails to load, choose **Retry**. The active Documents category and **My appointments** refresh on relevant server updates and reconnect or resume.
