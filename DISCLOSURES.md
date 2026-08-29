# DISCLOSURES — Jansah.AI (v1 prototype)

Third-party tools, libraries, and services used, with rights to use:

## Models & AI services
- **OpenAI Realtime API** — `gpt-realtime` family (speech-to-speech voice agent over WebRTC), `gpt-4o-transcribe` (input captions)
- **OpenAI Chat Completions** — narrative translation for bilingual PDFs (`TEXT_MODEL`, gpt-5 / gpt-4.1-mini)
- Built with AI coding-agent assistance throughout; agent conventions in `AGENTS.md`.

## Frameworks & libraries (all OSS, MIT/Apache/OFL licensed)
- Next.js (App Router) + React 19 — frontend
- Express 5 + TypeScript (tsx runtime) — backend
- Tailwind CSS v4 — styling base (design tokens are our own Jansah UI kit)
- Drizzle ORM + postgres-js — Postgres access
- zod — validation at every boundary
- @supabase/supabase-js — Storage + Realtime broadcasts
- Resend SDK + @react-email/components — transactional email
- @react-pdf/renderer — PDF letter generation
- Playwright — E2E/QA screenshots
- Vitest — unit tests

## Services
- **Supabase** — Postgres, private Storage bucket (artifacts), Realtime broadcast
- **Resend** — outbound email to the complainant only (never to any authority/bank/platform)

## Fonts (SIL Open Font License via Google Fonts)
- Bricolage Grotesque · Public Sans · Noto Sans · Noto Sans Devanagari · Spline Sans Mono

## Explicitly NOT used
- No government code, assets, logos, or APIs. Zero network calls to cybercrime.gov.in, CFCFRMS, UIDAI, any bank or platform. All state-side systems are simulated in a visibly-labeled mock plane (see /about).
- No real Aadhaar/PAN/OTP/payment data; synthetic identities only; transcripts redacted; demo data purged after 7 days.
- No third-party analytics.
- Fresh repository; no starter template beyond `create-next-app`.
