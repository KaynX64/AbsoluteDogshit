# LeoVital HealthLink mobile app

Flutter app for patients and emergency responders. Module-specific architecture, platform, and security guidance lives in [AGENTS.md](./AGENTS.md); repository-wide setup is in the root [AGENTS.md](../AGENTS.md).

## Configure and run

Set the API host in `lib/config/api_config.dart` for the device running the app. Android devices need a reachable LAN host; the Android emulator uses `10.0.2.2` to reach the development host. See [AGENTS.md](./AGENTS.md) for TLS and Firebase setup.

```powershell
flutter pub get
flutter run
```

## Build and test

```powershell
flutter test
flutter build apk --release
```

Do not commit Firebase service-account or `google-services.json` credentials. Platform folders are generated; edit only the exceptions listed in [AGENTS.md](./AGENTS.md).

## Booking an appointment

Choose your doctor or dentist, visit purpose, date and an available time, then add any optional notes. Tap **Review appointment** to see the care team, purpose, date, time, location and notes before booking. Choose **Edit details** to return to your saved selections, or **Confirm appointment** to submit. Closing the review also keeps your draft.

If availability refreshes during review, select a time again and review the updated details. If a slot is taken before submission completes, the app shows the server's message and refreshes available times. A successful booking shows the confirmation and a shortcut to **My appointments**.

The review follows the account's appearance settings, scrolls for long notes and enlarged text, and keeps its actions accessible on small screens. Run `flutter test test/appointment_booking_review_test.dart` for the booking review, dismissal, submission, availability refresh and theme/text-size checks.

## Account settings

Tap the **Account settings** gear in the patient portal or responder header to open the bottom drawer. It keeps your current screen behind it and provides appearance controls and **Change password** together. Close it with the X, swipe it down, or tap outside. The patient Profile tab also has a direct password shortcut.

To end your session, choose **Sign out of portal** in the patient Profile tab or **Sign out** in the responder header, then confirm.

Under **Appearance**, choose **Light** or **Dark**, then a named **LeoVital**, **Blossom**, or **Sunrise** palette shown as two overlapping color circles, matching desktop. The drawer and app update immediately, including when switching modes while the drawer stays open. The drawer shows account-save status and offers **Retry saving** when needed. Choices scroll on small screens or with enlarged text.

**Change password** opens the existing password form. Back returns to the drawer. Use your current password and confirm the new one; after a successful change, sign in again with the new password.

Appearance saves to the signed-in account using the same preferences as desktop. Pending saves remain cached for that account and retry when connectivity returns or the app resumes. Saved selections survive restarts. Sign-in uses the default appearance, and the app checks for desktop changes on resume or reconnect.

## Responder Hub on Android

Dedicated responder accounts open the hub after sign-in. Other eligible accounts can open **Responder Hub** from the patient portal's health pass or profile. The hub lists active incidents and opens the details and actions available to your account.

- **On duty** enables automatic incident delivery and the in-app siren for a newly triggered incident. Background alerts use the audible Android notification channel.
- **Quiet** keeps automatic incident delivery with vibration and suppresses the in-app siren. Background alerts use the quiet channel.
- **Off duty** pauses automatic incident updates and background SOS delivery after the setting saves. Use **Refresh incidents** to check manually.

Allow Android notifications for background delivery. The hub shows when delivery settings are still syncing and offers **Retry delivery settings** after a failed save. Use **Test siren for 3 seconds** to check the in-app sound. For the server rollout, see [migration 012](../server/MIGRATION-PLAN.md#fresh-and-existing-databases).
