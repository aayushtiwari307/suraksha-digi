# SurakshaDigi — Backend

> Node.js / Express backend for the SurakshaDigi elder-safety, medication-monitoring, and fraud-detection platform

The backend provides authentication, family-scoped elder management, medication tracking, automated missed-dose detection, transaction ingestion, deterministic fraud scoring, Gemini-based explanations, alerts, and secure Android device pairing/SMS ingestion.

**Backend repository:** https://github.com/aayushtiwari307/suraksha-digi  
**Live API:** https://suraksha-digi-backend.onrender.com  
**Frontend dashboard:** https://suraksha-digi-dashboard.vercel.app  
**Android companion:** https://github.com/aayushtiwari307/suraksha-digi-android

---

## What this does

SurakshaDigi's backend is the central application layer connecting the family dashboard, Android companion, MongoDB, and Gemini.

It handles:

- Family and Elder authentication with JWT
- Role and ownership enforcement
- Elder management and family-scoped access
- Medication scheduling and missed-dose monitoring
- Transaction SMS parsing and ingestion
- Deterministic fraud signal calculation and risk classification
- Gemini-generated risk explanations and elder guidance
- Alert creation, resolution, and source linking
- Android device pairing, device authentication, and SMS ingestion

---

## Quick demo path — no Android setup required

The frontend's **Simulate SMS** page sends a bank-style transaction SMS directly to the backend.

It uses the **same fraud-processing pipeline** that receives events from the Android companion:

```text
Simulate SMS
      │
      └──────────────┐
                     ↓
              SMS ingestion
                     ↓
              SMS parsing
                     ↓
           Fraud signal analysis
                     ↓
             Risk score / level
                     ↓
            Gemini explanation
                     ↓
                  Alert
```

This provides a quick way to demonstrate the backend fraud engine without installing or pairing an Android device.

---

## Real Android flow

For the full end-to-end path:

```text
Bank SMS on Android
        ↓
Android Companion
        ↓ HTTPS + scoped device JWT
POST /api/devices/sms-event
        ↓
SMS parsing / fallback parsing
        ↓
Deterministic fraud signals
        ↓
Risk score + risk level
        ↓
Gemini explanation
        ↓
Transaction + Alert
        ↓
Family Dashboard
```

The Android companion and the dashboard therefore feed the **same backend fraud pipeline** rather than separate scoring systems.

---

## Fraud Detection

Risk is decided by the application, not by Gemini.

The backend calculates these deterministic signals:

| Signal | Weight |
|---|---:|
| New recipient | 25 |
| Unusual amount | 25 |
| Unusual time | 15 |
| High velocity | 20 |
| Scam keyword | 25 |

The total score is capped at 100 and mapped to:

```text
0–29   → LOW
30–59  → MEDIUM
60–100 → HIGH
```

The amount/time/velocity checks use the elder's recent transaction history where applicable, and the implementation also handles first-history cases with explicit thresholds.

Gemini receives the already-calculated evidence and generates the explanation. It is explicitly instructed not to change the application's risk level or invent additional signals.

---

## Core API Areas

### Authentication

```text
POST /api/family/register
POST /api/family/login
POST /api/elders/register
POST /api/elders/login
```

Protected profile/management routes are under `/api/family` and `/api/elders`.

### Elder and medication management

```text
GET   /api/family/profile
GET   /api/family/elders
GET   /api/elders/profile
PATCH /api/elders/:elderId
PATCH /api/elders/:elderId/status
POST  /api/elders/:elderId/device-pair

POST /api/medications/add
GET  /api/medications/elder/:elderId
PUT  /api/medications/mark-taken/:medicationId
```

### Fraud / transactions

```text
POST /api/transactions/ingest-sms
GET  /api/transactions/elder/:elderId
```

### Alerts

```text
POST /api/alerts/create
GET  /api/alerts/elder/:elderId
GET  /api/alerts/unresolved/:elderId
PUT  /api/alerts/resolve/:alertId
```

### AI helpers

```text
POST /api/ai/analyze-transaction
POST /api/ai/hindi-guidance
POST /api/ai/safety-message
```

### Android device integration

```text
POST   /api/devices/pair
POST   /api/devices/sms-event
DELETE /api/devices/me
```

Device SMS ingestion is protected by device-scoped JWT authentication and server-side validation of the linked elder/device state.

---

## Medication Monitoring

Medication monitoring is intentionally server-side so missed-dose detection does not depend on the dashboard being open.

A background `node-cron` job checks medication logs, handles IST calendar dates, detects missed doses, and creates severity-based alerts with idempotent source linking.

The backend also maintains a unique medication-log constraint per medication/date to prevent duplicate daily logs.

---

## Security

The backend includes:

- JWT authentication for Family/Elder accounts
- Scoped device JWTs for Android ingestion
- bcryptjs password hashing
- Family/role/ownership checks on protected operations
- Helmet security headers
- Rate limiting on authentication-sensitive routes
- Device pairing rate limiting
- Environment-based secrets
- HTTPS-only Android communication
- Input validation for key API payloads
- MongoDB-backed authorization state

Important secrets are loaded from environment variables rather than committed to the repository.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Database | MongoDB Atlas + Mongoose |
| Authentication | JWT + bcryptjs |
| AI | Gemini 2.5 Flash API |
| Background jobs | node-cron |
| HTTP client | Axios |
| Security | Helmet, express-rate-limit |
| Deployment | Render |

---

## Project Structure

```text
suraksha-digi/
├── src/
│   ├── config/
│   │   ├── db.js
│   │   └── gemini.js
│   ├── controllers/
│   │   ├── aiController.js
│   │   ├── alertController.js
│   │   ├── deviceController.js
│   │   ├── elderController.js
│   │   ├── familyController.js
│   │   ├── medicationController.js
│   │   └── transactionController.js
│   ├── jobs/
│   │   └── missedMedicationJob.js
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   ├── deviceAuthMiddleware.js
│   │   ├── ownershipMiddleware.js
│   │   ├── rateLimiter.js
│   │   └── roleMiddleware.js
│   ├── models/
│   │   ├── Alert.js
│   │   ├── Device.js
│   │   ├── Elder.js
│   │   ├── Family.js
│   │   ├── Medication.js
│   │   ├── MedicationLog.js
│   │   └── Transaction.js
│   ├── routes/
│   │   ├── aiRoutes.js
│   │   ├── alertRoutes.js
│   │   ├── deviceRoutes.js
│   │   ├── elderRoutes.js
│   │   ├── familyRoutes.js
│   │   ├── medicationRoutes.js
│   │   └── transactionRoutes.js
│   ├── services/
│   │   ├── alertService.js
│   │   └── fraudService.js
│   ├── utils/
│   │   ├── aiValidation.js
│   │   ├── fraudSignals.js
│   │   ├── istTime.js
│   │   ├── ownership.js
│   │   ├── smsParser.js
│   │   └── validators.js
│   └── index.js
├── package.json
└── package-lock.json
```

---

## Getting Started

**Requirements:** Node.js v18+

```bash
git clone https://github.com/aayushtiwari307/suraksha-digi.git
cd suraksha-digi
npm install
npm start
```

The API runs on port `5000` by default unless `PORT` is set.

### Environment variables

```text
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
GEMINI_API_KEY=your_gemini_api_key
PORT=5000
```

Do not commit `.env` files or real credentials.

---

## Deployment

The backend is deployed on **Render** and serves the React dashboard and Android companion through the API.

**Live API:** https://suraksha-digi-backend.onrender.com

---

## Known Limitations (by design)

- SMS parsing is regex/keyword based and will not understand every possible bank-message wording; Gemini is used as a fallback when the deterministic parser cannot confidently extract key fields.
- Only one active Android companion device is supported per elder profile.
- There is currently no automated forgot-password recovery flow for family accounts.
- This is a portfolio/demo project and has not undergone production banking or Play Store compliance review.

---

Built solo as a portfolio project by [Aayush Tiwari](https://github.com/aayushtiwari307).
