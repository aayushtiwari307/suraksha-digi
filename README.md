# SurakshaDigi — Backend

**Predictive digital safety platform for elderly care.** Family members monitor an elder's medication adherence and get alerted to suspicious financial activity, without the elder needing to do anything technical themselves.

**Live API:** https://suraksha-digi-backend.onrender.com
**Frontend:** https://suraksha-digi-dashboard.vercel.app
**Frontend repo:** https://github.com/aayushtiwari307/suraksha-digi-dashboard

> Free-tier Render hosting — the API spins down after inactivity, so the first request after a while may take ~30–50s to wake up.

---

## What this solves

Elderly people living independently or semi-independently face two quiet risks that often go unnoticed until it's too late: missed medication, and financial scams (UPI/bank fraud is a real, common attack vector against elderly users in India). This app gives family members a single dashboard for both — without requiring the elder to install anything or actively report problems themselves.

## How it actually works

### Medication tracking
- Family adds an elder's medication schedule (dose, time, duration).
- A background job (`node-cron`, every 5 minutes) independently checks for missed doses — detection does **not** depend on anyone opening the dashboard. This was a deliberate fix: the first version only checked for missed doses when a GET request happened to hit the dashboard, which meant a dose could be missed for days with zero alert if nobody opened the app.
- All date/time logic runs through a single IST-aware (`Asia/Kolkata`) time utility. This mattered more than it sounds — an earlier version silently used UTC-based date boundaries (`toISOString()`), which meant "today's medications" could resolve to the wrong day depending on the time of day. Fixed once, used everywhere, so it can't drift out of sync between the scheduler and the API.
- Alert creation is idempotent at two layers: an `alertCreated` flag on each log (so a failed alert-send is retried without re-detecting the same miss), and a database-level unique index on `Alert{sourceType, sourceId}` as a hard guarantee against duplicate alerts, even under concurrent execution.

### Fraud detection
- A "Simulate Incoming SMS" flow lets a family member paste a bank/UPI transaction SMS. This is **explicitly a simulation** — there's no real telecom/bank/UPI integration, and I'm not pretending otherwise. Building a real SMS-interception pipeline was out of scope for what this project needed to prove.
- What *is* real: the SMS is parsed by a regex-first deterministic parser (Gemini is only a fallback for SMS formats the regex can't confidently handle, and its fallback output is validated before being trusted).
- Every transaction is checked against that specific elder's own transaction history for signals: new/unfamiliar recipient, deviation from their usual amount range, unusual time of day, transaction velocity, and known scam-message keywords.
- **The risk score and risk level are computed entirely in application code** — deterministically, from those signals. Gemini is called *after* the decision is already made, purely to generate a human-readable explanation of why something was flagged. It never has authority over whether an alert fires. I made this call deliberately: I didn't want a fraud-detection feature where the actual decision-making is an opaque LLM call that could hallucinate a wrong verdict.
- Duplicate transaction submissions are deduplicated via a SHA-256 fingerprint, enforced both in application logic and at the database level.

### Elder management
Family members can add, edit, and deactivate/reactivate elders. Deactivating an elder correctly excludes them from new medication scheduling and fraud monitoring — this took a real bug fix to get consistent, since the two features had been checking elder status independently and could disagree with each other.

## Tech stack

- **Runtime:** Node.js, Express
- **Database:** MongoDB (Atlas), Mongoose
- **Auth:** JWT, bcrypt
- **AI:** Google Gemini (via raw REST calls, not the SDK) — used only for explanation text, never for decisions
- **Scheduling:** node-cron
- **Security:** Helmet, express-rate-limit, server-side ownership enforcement on every elder-scoped route (never trusted from the frontend)

## API overview

| Area | Routes |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login` |
| Elders | `GET/POST /api/elders`, `PATCH /api/elders/:id`, `PATCH /api/elders/:id/status` |
| Family | `GET /api/family/elders` |
| Medications | `GET/POST /api/medications`, `GET /api/medications/today` |
| Transactions / Fraud | `POST /api/transactions/analyze` |
| Alerts | `GET/POST /api/alerts` |
| AI | `POST /api/ai/analyze-transaction`, `POST /api/ai/hindi-guidance`, `POST /api/ai/safety-message` |

All elder-scoped routes are protected by JWT auth plus a server-side ownership check — a family account can only ever see or modify elders it actually owns, regardless of what the frontend sends.

## Running locally

```bash
git clone https://github.com/aayushtiwari307/suraksha-digi.git
cd suraksha-digi
npm install
```

Create a `.env` file:

```
MONGO_URI=your_mongodb_atlas_connection_string
JWT_SECRET=your_secret
GEMINI_API_KEY=your_gemini_key
```

> Requires a replica-set-backed MongoDB (MongoDB Atlas, including the free tier, qualifies) — alert creation uses real database transactions.

```bash
npm run dev
```

## Known limitations (by design, not oversight)

- SMS ingestion is simulated, not a live telecom/bank integration — an honest scope boundary for a student portfolio project, not a hidden gap.
- Alerts are in-app only; there's no SMS/WhatsApp/email/push notification layer.
- No password reset flow yet.
- A narrow race condition exists in transaction deduplication under near-simultaneous duplicate submissions — it can surface a generic error instead of a graceful "duplicate detected" response, but the database's unique index still guarantees no duplicate record is ever actually created.

---

Built solo as a portfolio project by [Aayush Tiwari](https://github.com/aayushtiwari307).
