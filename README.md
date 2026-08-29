# Jansah.AI — Janta ka Sahai · जनता का सहाई

**Voice AI for cyber-complaint intake & follow-through.** A citizen talks — Hindi, English, Hinglish, any
regional language — to an AI agent (OpenAI `gpt-realtime` over WebRTC) that classifies the crime against an
NCRP-style taxonomy, fills the complaint slot-by-slot with digit-by-digit read-backs, verifies identity via a
mocked Aadhaar OTP (anonymous filing on the women/children track), and issues a 14-digit case number. Then the
system **works the case**: complaint PDF + the category's action letter on day 0, statutory-style clocks, the
FIR escalation ladder (SHO pack → SP letter → magistrate draft) when the case stalls, and emails with the
documents attached. A per-case time machine makes day 15 demoable in minute 3.

> Independent hackathon prototype. Not a government service. All state-side systems (NCRP, CFCFRMS, Aadhaar,
> banks, police) are simulated in a visibly-labeled mock plane — see `/about` in the app.

## Layout

```
jansah/
├── backend/     Express + TS (port 4000) — case engine, playbooks, clocks, tools API,
│                Realtime session minting, PDFs, emails, ops API
├── frontend/    Next.js (port 3000) — /  /call  /track  /case/[n]  /ops  /about
├── AGENTS.md    coding-agent conventions (spec Appendix C)
├── DISCLOSURES.md
└── qa/          Ravi golden-journey script · voice drills · API E2E script
```

## Run it

Prereqs: Node 20+, a Supabase project, an OpenAI key with Realtime access, a Resend key + verified domain.

```bash
# 1. backend
cd backend
cp .env.example .env          # fill in keys (see Appendix A of the spec)
npm install
npm run migrate               # applies DDL (idempotent) + creates the private storage bucket
npm run seed                  # suspect repository + 4 closed cases + 5 demo personas (real PDFs)
npm run dev                   # → http://localhost:4000/health

# 2. frontend
cd ../frontend
# .env.local needs: NEXT_PUBLIC_API_BASE, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_KEY
npm install
npm run dev                   # → http://localhost:3000
```

## Demo in 90 seconds

1. **`/call`** → speak (Hinglish works): "parcel scam ho gaya, 48 hazaar bhej diye UPI se…" — watch the slot
   sidebar fill, the suspect check flag `quickhelp.desk@okpay` (3+ prior reports), the mock Aadhaar OTP arrive
   as an on-screen SMS (`424242`), the read-back, and the 14-digit case number. PDFs + ack email land instantly.
2. **`/track?demo=1`** → demo picker → *UPI fraud · day 15* → OTP `424242` → the **stalled** case page:
   FIR pack ready, ₹31,000 held, SP letter counting down. Time-machine chips (+7d / Next clock) drive the ladder live.
3. **`/ops`** (basic auth = `OPS_BASIC_AUTH` in backend/.env) → Confirm freeze / Mark FIR / Resolve — every
   action lands on the citizen's timeline in real time. This console **is** the mocked government/bank.

## Deploy

**Frontend → Vercel.** Import the repo, set **Root Directory = `frontend`**, framework auto-detects Next.js.
Environment variables: `NEXT_PUBLIC_API_BASE` (the backend's public URL), `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_KEY` (publishable key).

**Backend → Render (blueprint included) or Railway.** The backend is a long-lived Express process — it does
not fit Vercel serverless. With Render: New → Blueprint → point at this repo (`render.yaml` provisions the
service from `backend/`), then fill the `sync: false` env vars from your local `backend/.env`. With Railway:
new service from repo, root directory `backend`, start command `npm run start`, copy the same env vars.
Either way, two values cross-link the deploys:
- backend `APP_BASE_URL` = your Vercel URL (drives CORS + the track links in emails)
- frontend `NEXT_PUBLIC_API_BASE` = your backend URL

Avoid free tiers that sleep on idle — a cold start mid-voice-demo is fatal. Health check: `GET /health`.
The database/storage/email stay exactly as configured (Supabase + Resend are already cloud services).

## Tests & QA

```bash
cd backend && npm test        # redaction, clocks, transitions, slots, case numbers (18 tests)
qa/e2e-api.sh                 # full Ravi journey through the tools API (guards, OTP, injection drill)
```

Voice drills checklist: `qa/drills.md`. Golden-journey transcript: `qa/scripts/ravi.md`.

## Honesty invariants (enforced in code, not prompt)

- The model **cannot** change case status / confirm freezes / mark FIRs — those tools don't exist on the server
  (`"mark my FIR as registered"` → 404; see `qa/e2e-api.sh` step 10).
- Anonymous track: `send_aadhaar_otp` → 409; names in `capture_contact` are silently dropped.
- Authority letters are downloads only; email goes to the complainant alone.
- Transcripts/payloads pass through `redact.ts` (12-digit → last-4 mask, card-shaped → removed, OTPs scrubbed —
  Devanagari digits included) before any persist.
- Every clock firing writes a `clock_fired` event with real + virtual timestamps — the demo's audit trail.
