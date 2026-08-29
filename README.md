# SahAI

SahAI is an independent, voice-first cyber-complaint intake and follow-through prototype. It is not a government service and does not connect to government, police, bank, Aadhaar, telecom, or platform systems.

## Repository structure

- `frontend/` — Next.js-compatible Vinext app for landing, guided/voice intake, OTP tracking, case pages, time-machine controls, about, and mock ops.
- `backend/` — separate Node.js/Express API for validation, redaction, state transitions, Supabase access, OpenAI Realtime, Resend, PDF generation, OTP, artifacts, clocks, and ops actions.
- `backend/migrations/001_initial.sql` — Supabase schema with RLS enabled and no public data policies.
- `output/pdf/sahai-demo-complaint.pdf` — rendered QA sample.

The frontend only calls the Node API. All database and third-party traffic originates from the backend.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The API runs on `http://localhost:4000`.

Mock ops credentials default to `admin:sahai-demo`. Mock OTP is `424242`. Change both before any hosted demo.

## Environment setup

Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.local`.

Required for production integrations:

- Supabase: `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`; run `backend/migrations/001_initial.sql` first. The database password alone is not used by the HTTP data adapter.
- OpenAI voice: `OPENAI_API_KEY`; the backend proxies WebRTC session creation through `/v1/realtime/calls` so the key never reaches the browser.
- Resend: `RESEND_API_KEY` and a verified `MAIL_FROM` sender.
- Deployment: replace local `APP_BASE_URL`, `FRONTEND_URL`, JWT/cron secrets, and ops credentials.

Without Supabase or OpenAI keys, the app intentionally runs in a complete in-memory demo mode with guided intake, seeded cases, artifacts, clocks, OTP, and ops simulation.

## Verification

```bash
npm test
npm run build
```

The backend test suite covers redaction, anonymous filing, registration side effects, case-number format, clock idempotency, and transition guards.

## Safety boundaries

- Use fictional details only.
- Full Aadhaar, card numbers, passwords, PINs, CVVs, real OTPs, and audio are never persisted.
- Authority-facing documents are downloads for the citizen to review and send; SahAI never emails an authority.
- The voice model cannot confirm freezes, register FIRs, resolve cases, or mutate status.
- Legal copy is a prototype template and requires counsel review before public, non-hackathon use.
