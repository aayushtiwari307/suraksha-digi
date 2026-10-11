# SurakshaDigi Dashboard — Frontend

> Family caregiver dashboard for the SurakshaDigi elder-safety platform

A React-based dashboard that lets family members manage elders, track medication adherence, monitor transaction safety, and review alerts — without the elder needing to do anything technical themselves.

**Live app:** https://suraksha-digi-dashboard.vercel.app  
**Backend repo:** https://github.com/aayushtiwari307/suraksha-digi  
**Android companion repo:** https://github.com/aayushtiwari307/suraksha-digi-android

---

## Try it in 30 seconds — no Android setup required

Want to see the fraud-detection pipeline without setting up Android Studio, building an APK, or pairing a phone?

Open the **[live dashboard](https://suraksha-digi-dashboard.vercel.app)**, sign in as a Family user, and open **Simulate SMS**. Paste a bank-style transaction SMS for a selected elder.

It runs through the **same backend fraud pipeline** used by the Android companion:

```text
SMS → Parsing → Fraud Signals → Risk Score → Gemini Explanation → Alert
```

This is the quickest way to explore the core fraud-monitoring flow.

### Full real-device flow

For the complete experience, pair an elder's Android phone from **Manage Elders**. The companion captures relevant incoming bank SMS and sends the event to the same backend fraud pipeline automatically — no manual copying is required.

```text
                      ┌─ Simulate SMS ─────────┐
Transaction SMS ──────┤                         ├──→ Fraud Pipeline
                      └─ Android Companion ─────┘
                                                       ↓
                                               Risk Score / Level
                                                       ↓
                                               Gemini Explanation
                                                       ↓
                                                    Alert
                                                       ↓
                                               Family Dashboard
```

---

## What this does

Family members log in, add elders under their account, track medication schedules, and monitor for fraud — either by testing the fraud pipeline directly with a simulated SMS or by pairing an elder's real Android phone so genuine bank SMS gets analyzed automatically.

## Features

- **Dual-role login** — Family and Elder accounts with JWT authentication
- **Elder management** — add, edit, deactivate/reactivate elders under a family account
- **Medication tracking** — schedule doses with duration control, view today's medications, and receive missed-dose alerts detected server-side by a background job independent of the dashboard being open
- **Fraud simulation** — paste any bank-style transaction SMS on the **Simulate SMS** page and run it through the same real fraud pipeline used by Android
- **Android device pairing** — generate a one-time pairing code for an active elder from the dashboard and link a real Android phone for automatic SMS-based fraud monitoring
- **Alerts** — view fraud and missed-medication alerts per elder, including severity and resolution status
- **Auto-attached auth** — Axios interceptor attaches the stored JWT to API requests automatically
- **Protected routes** — unauthenticated users are redirected to the login page

## Fraud pipeline

The frontend sends transaction SMS data to the backend, where deterministic fraud signals are calculated before Gemini is used for explanation.

Signals include:

- New recipient
- Unusual transaction amount
- Unusual transaction time
- High transaction velocity
- Scam-related keywords

The backend maps the resulting score to **low, medium, or high risk**. Gemini generates the explanation text; it does not make the risk decision.

---

## Architecture

```text
React Frontend
      ↓ Axios + JWT interceptor
Express Backend ──→ MongoDB Atlas
      │
      ├── Deterministic Fraud Signals → Risk Score / Level
      │                    ↓
      │             Gemini Explanation
      │                    ↓
      │                  Alerts
      │
      └── Android Companion
             (real SMS ingestion)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + Vite 8 |
| Routing | React Router DOM 7 |
| State management | Context API |
| HTTP client | Axios with interceptors |
| Styling | Plain CSS |

---

## Project Structure

```text
suraksha-digi-dashboard/
├── src/
│   ├── api/
│   │   └── axios.js             # API client + JWT interceptor
│   ├── context/
│   │   └── AuthContext.jsx      # Global auth state
│   ├── components/
│   │   └── ElderSelector.jsx    # Family elder selection
│   ├── hooks/
│   │   └── useFamilyElders.js   # Family elder data hook
│   ├── pages/
│   │   ├── Login.jsx            # Family/Elder authentication
│   │   ├── Register.jsx         # Family account registration
│   │   ├── Dashboard.jsx        # Alerts + today's medications
│   │   ├── AddElder.jsx         # Register a new elder
│   │   ├── ManageElders.jsx     # Edit/deactivate + Android pairing
│   │   ├── AddMedication.jsx    # Schedule a medication
│   │   └── SimulateSms.jsx      # Run the real fraud pipeline with pasted SMS
│   ├── App.jsx                  # Route definitions
│   └── main.jsx                 # Entry point
├── index.html
└── vite.config.js
```

---

## React Patterns Used

### Context API

`AuthContext` provides authentication state and user information across the application without prop drilling.

### Axios Interceptors

The API client automatically attaches the stored Family/Elder JWT as a Bearer token to outgoing requests.

### Protected + Family-Scoped Routes

Protected routes require authentication, while Family-only pages such as **Manage Elders**, **Add Medication**, and **Simulate SMS** additionally enforce the Family role in the frontend before rendering.

---

## Getting Started

**Requirements:** Node.js v18+

```bash
git clone https://github.com/aayushtiwari307/suraksha-digi-dashboard.git
cd suraksha-digi-dashboard
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` by default.

Set `VITE_API_URL` when pointing the frontend to a backend other than the default local API (`http://localhost:5000/api`).

---

## Pages Overview

| Page | Route | Description |
|---|---|---|
| Login | `/` | Family or Elder authentication |
| Register | `/register` | Create a new family account |
| Dashboard | `/dashboard` | View alerts and today's medications for a selected elder |
| Add Elder | `/add-elder` | Register a new elder under the family account |
| Manage Elders | `/manage-elders` | Edit/deactivate elders and generate an Android pairing code |
| Add Medication | `/add-medication` | Schedule a medication for an elder |
| Simulate SMS | `/simulate-sms` | Test the live fraud pipeline with a pasted transaction SMS |

---

## Deployment

The current frontend is deployed on **Vercel** and connects to the deployed SurakshaDigi backend on **Render**.

**Live dashboard:** https://suraksha-digi-dashboard.vercel.app

---

## Known Limitations (by design)

- No in-app password reset flow yet; recovery is currently handled manually at the backend/database level.
- Only one Android device can currently be paired per elder profile.
- SMS simulation remains available as the quickest way to demonstrate the fraud pipeline without Android setup.

---

Built solo as a portfolio project by [Aayush Tiwari](https://github.com/aayushtiwari307).
