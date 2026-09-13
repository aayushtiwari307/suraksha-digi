# SurakshaDigi Android Companion — Phase D

A lightweight Android companion for the SurakshaDigi portfolio project. It listens for incoming SMS broadcasts, keeps only likely transaction/bank messages, queues them locally, and securely uploads the raw event to the existing SurakshaDigi fraud-ingestion API.

## What it does

1. Family generates a one-time 12-character pairing code for an active elder from the SurakshaDigi web dashboard.
2. On the Android phone, enter the backend API URL and pairing code.
3. The app generates a stable installation ID and receives a scoped device JWT.
4. After SMS permission is granted, the app listens for `SMS_RECEIVED` broadcasts.
5. It forwards only likely transaction/bank SMS to the existing fraud pipeline.
6. Events are stored in a small local SQLite queue until the backend confirms success.
7. Network outages cause retry through Android `JobScheduler`.
8. The device token is encrypted using the Android Keystore before storage.

## Phase D UX/debug improvements

- Clear in-app status card for paired/unpaired, permission, pairing, retry, and unpair states.
- Every action gives immediate visible feedback instead of failing silently.
- An activity log is shown inside the app so pairing/network/permission problems can be diagnosed without USB debugging or Logcat.
- Pairing errors are surfaced as both status text and a Toast, with useful messages for network, invalid/expired code, and malformed server responses.
- SMS permission state is visible and the permission result is handled explicitly.
- Backend URL handling accepts either the Render service root or the `/api` base URL and normalizes it automatically.
- The deployed SurakshaDigi backend URL is used as the default API base.
- Device ID can be copied from the app.
- Unpair requires confirmation to prevent accidental credential removal.
- Upload scheduling provides explicit feedback and preserves pending SMS events when the server returns 401/403 so a later re-pair can upload them.

## Backend dependency

The Android app uses these Phase D endpoints:

- `POST /api/elders/:elderId/device-pair` — family-authenticated pairing-code creation
- `POST /api/devices/pair` — exchanges code + device ID for a scoped device JWT
- `POST /api/devices/sms-event` — authenticated SMS event ingestion
- `DELETE /api/devices/me` — unpair the companion

## Build

Open the project in Android Studio and let it use the configured Android Gradle Plugin. The project is Java-only and intentionally avoids third-party Android libraries.

The configured API base is:

`https://suraksha-digi-backend.onrender.com/api`

You can also paste the Render service root; the app will add `/api` automatically.

Generate a debug APK from Android Studio and install it on the test phone for controlled portfolio/demo testing.


## Final correctness fixes
- Explicit unpair clears the local SMS queue and cancels the pending upload job.
- SMS event IDs are deterministic SHA-256 hashes of normalized sender, received timestamp, and message text, so duplicate deliveries are locally deduplicated.
- SMS ingestion, upload, and unpair use a shared in-process device-state lock to prevent a stale queue event from racing across an explicit unpair.
