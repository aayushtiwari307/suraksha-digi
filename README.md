# SurakshaDigi Android Companion — Phase D

A lightweight Android companion for the **SurakshaDigi** portfolio project. It listens for incoming SMS broadcasts, keeps only likely transaction/bank messages, queues them locally, and securely uploads the raw event to the existing SurakshaDigi fraud-ingestion API.

- **Backend repo:** [suraksha-digi](https://github.com/aayushtiwari307/suraksha-digi)
- **Frontend (family dashboard) repo:** [suraksha-digi-dashboard](https://github.com/aayushtiwari307/suraksha-digi-dashboard)
- **Live dashboard:** https://suraksha-digi-dashboard.vercel.app

---

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

## Confirmed working end-to-end (real device test, not just simulated)

This app has been tested against **real bank SMS on a physical phone**, not just the dashboard's "Simulate Incoming SMS" demo path. Two live ₹1 UPI transactions were correctly detected, uploaded, and appeared on the family dashboard's transaction history in real time.

Two real bugs were found and fixed to get to this working state:

1. **Compile bug:** `SmsReceiver.java`'s SHA-256 event-ID logic could throw a checked `NoSuchAlgorithmException` from inside `onReceive()`, which cannot declare `throws`. Fixed by catching it internally and rethrowing as an unchecked exception.
2. **Silent SMS-drop bug (the real root cause of missed real-world SMS):** `SmsReceiver` was declared with `android:exported="false"` in `AndroidManifest.xml`. `SMS_RECEIVED` is a system broadcast sent by a different UID (the Telephony framework, not this app), so Android requires `exported="true"` for the receiver to ever receive it. With `false`, Android silently dropped the broadcast — no crash, no error, nothing in Logcat — which is why real bank SMS never showed up even though SMS permission was granted and the device was correctly paired. Fixed by setting `exported="true"`.

On some phones (notably Xiaomi/MIUI), you may also need to manually set **Battery saver → No restrictions** and enable **Autostart** for this app, or the OS can still block background SMS delivery independently of the manifest setting.

## Tech stack

- **Language:** Java
- **Platform:** Android SDK (native, no framework)
- **Background work:** `BroadcastReceiver` (SMS interception), `JobScheduler` (reliable retry/upload)
- **Local storage:** SQLite (pending-event queue), Android Keystore (encrypted device token storage)
- **Networking:** Plain HTTPS calls to the SurakshaDigi backend REST API

## Security & privacy notes

- The app does **not** read the phone's SMS inbox/history — it only reacts to new incoming messages matching a transaction-like pattern.
- The device's authentication token is encrypted using the Android Keystore before being stored on-device.
- Pending events remain local until the backend confirms receipt — nothing is discarded on a failed upload.
- Backend communication requires HTTPS; cleartext traffic is disabled at the manifest level.

## Setup / build instructions

**Requirements:** Android Studio (recent stable version), a physical Android device for full testing (emulators cannot receive real SMS).

1. Clone this repo:
   ```
   git clone https://github.com/aayushtiwari307/suraksha-digi-android.git
   ```
2. Open the project root in Android Studio and let Gradle sync.
3. Build → Build Bundle(s) / APK(s) → Build APK(s).
4. Install the generated `app-debug.apk` on an Android phone.
5. Open the app, enter the backend API URL (e.g. `https://suraksha-digi-backend.onrender.com/api`).
6. From the SurakshaDigi web dashboard, generate a pairing code for an elder (valid for 10 minutes).
7. Enter the code in the app and tap **Pair Android device**.
8. Grant SMS permission when prompted.
9. On Xiaomi/MIUI (and some other OEM skins), also allow the app to run in the background and disable battery optimization for it — see note above.

## Known limitations (honest scope notes)

- This is a portfolio/demo project, not a published or production app — it hasn't gone through Play Store review, security auditing, or multi-device-manufacturer QA.
- SMS parsing is regex/keyword-based and tuned to common Indian bank SMS formats; it will not catch every possible wording variation.
- There is currently no in-app forgot-password recovery for the associated family account (handled at the backend/dashboard level).
- Only one Android device can currently be paired per elder profile at a time.

## License

Personal portfolio project. Not licensed for commercial use.
