# SurakshaDigi Android Companion

Real-time Android SMS companion for an elder-care fraud detection system. Captures bank transaction SMS, queues events offline, securely syncs them to a Node/Express fraud engine, and surfaces suspicious transactions on a family dashboard — validated end-to-end against **real bank SMS on a real device**, not a simulated form.

```
Real SMS → Android → Secure API → Fraud Engine → Alert → Family Dashboard
```

- **Backend repo:** [suraksha-digi](https://github.com/aayushtiwari307/suraksha-digi)
- **Frontend (family dashboard) repo:** [suraksha-digi-dashboard](https://github.com/aayushtiwari307/suraksha-digi-dashboard)
- **Live dashboard:** https://suraksha-digi-dashboard.vercel.app

## Why this stands out

- **Real Android integration** — intercepts live `SMS_RECEIVED` broadcasts on a physical device, not a simulated SMS input box.
- **Offline-first queue** — SMS events persist in a local SQLite queue and retry via Android `JobScheduler` until the backend confirms upload; nothing is lost on a network drop.
- **Deterministic fraud scoring** — the backend owns the risk decision (recipient novelty, amount deviation, unusual time, velocity, scam keywords); AI is used only to explain the decision, never to make it.
- **Secure device pairing** — one-time pairing codes exchange for a scoped device JWT, encrypted at rest via Android Keystore.
- **Proven on a real device** — two live ₹1 UPI transactions were sent, detected, uploaded, and correctly appeared on the live family dashboard in real time.

## Prefer a quick look without the Android setup?

Building and pairing the Android app takes a few minutes of setup. If you'd rather see the fraud-detection pipeline immediately, the [live dashboard](https://suraksha-digi-dashboard.vercel.app) has a **"Simulate Incoming SMS"** page — paste any bank-style transaction text for a chosen elder and it runs through the exact same real fraud engine (parsing, signal scoring, alert creation) this app feeds into. This repo exists to prove that same pipeline also works from a real phone, with zero manual steps.

## How it works

1. Family generates a one-time 12-character pairing code for an elder from the SurakshaDigi web dashboard.
2. The Android app is paired using that code + the backend API URL, generating a stable installation ID and a scoped device JWT.
3. Once SMS permission is granted, the app listens for `SMS_RECEIVED` broadcasts.
4. Only messages that look like bank/transaction SMS (based on currency patterns and keywords like "debited", "credited", "UPI", "A/c") are forwarded — regular texts are never read or transmitted.
5. Matching events are queued locally in SQLite and uploaded to the backend's fraud-ingestion API.
6. Failed uploads (e.g. no network) automatically retry via `JobScheduler`.
7. The backend parses the SMS, scores it against deterministic fraud signals, and raises an alert on the family dashboard if it looks risky.

## Tech stack

- **Language:** Java
- **Platform:** Android SDK (native, no framework)
- **Background work:** `BroadcastReceiver` (SMS interception), `JobScheduler` (reliable retry/upload)
- **Local storage:** SQLite (pending-event queue), Android Keystore (encrypted device token)
- **Networking:** HTTPS calls to the SurakshaDigi backend REST API

## Security & privacy

- Does **not** read the phone's SMS inbox/history — only reacts to new incoming messages matching a transaction-like pattern.
- Device auth token is encrypted via Android Keystore before storage.
- Pending events remain local until the backend confirms receipt.
- Cleartext traffic is disabled at the manifest level; HTTPS only.

## Setup

**Requirements:** Android Studio (recent stable), a physical Android device (emulators can't receive real SMS).

```
git clone https://github.com/aayushtiwari307/suraksha-digi-android.git
```

1. Open the project root in Android Studio, let Gradle sync.
2. Build → Build Bundle(s) / APK(s) → Build APK(s).
3. Install the generated `app-debug.apk` on an Android phone.
4. Open the app and enter the backend API URL (e.g. `https://suraksha-digi-backend.onrender.com/api`).
5. Generate a pairing code for an elder from the web dashboard (valid 10 minutes) and enter it in the app.
6. Grant SMS permission when prompted.
7. On Xiaomi/MIUI (and some other OEM skins), also allow the app to run in the background and disable battery optimization for it — see Engineering Challenges below.

## Engineering challenges & fixes

Two real bugs were found and fixed while validating this against a live device:

- **Compile-time exception handling:** `SmsReceiver.java`'s SHA-256 event-ID logic could throw a checked `NoSuchAlgorithmException` from inside `onReceive()`, which cannot declare `throws`. Fixed by catching internally and rethrowing as unchecked.
- **Silent broadcast drop (root cause of missed real-world SMS):** `SmsReceiver` was declared `android:exported="false"`. Since `SMS_RECEIVED` is a system broadcast from a different UID (the Telephony framework), Android requires `exported="true"` for the receiver to ever get it — with `false`, the broadcast was silently dropped with zero error or log output. Fixed by setting `exported="true"`, which immediately resolved real-SMS detection in live testing.
- On some OEM Android skins (notably Xiaomi/MIUI), background/battery restrictions independently block SMS delivery even with the manifest fixed — resolved by enabling "No restrictions" battery mode and Autostart for the app.

## Known limitations

This is a portfolio/demo project, not a published or production app — it hasn't gone through Play Store review, security auditing, or multi-device-manufacturer QA.

- SMS parsing is regex/keyword-based, tuned to common Indian bank SMS formats — won't catch every wording variation.
- No in-app forgot-password recovery for the associated family account yet (handled at the backend/dashboard level).
- Only one Android device can be paired per elder profile at a time.

## License

Personal portfolio project. Not licensed for commercial use.
