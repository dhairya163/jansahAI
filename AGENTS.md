# Project: Jansah.AI — voice cyber-complaint prototype

Read the spec (`cyber-voice-agent-spec (1).md` in the parent folder) before any task.

## Conventions
- TypeScript strict everywhere; zod at every boundary (slot patches, tool args).
- **All OpenAI calls live in `backend/src/agent/realtime.ts`** (session minting, chat completions). The API surface drifts — keep every touchpoint in that one file.
- **All legal text lives ONLY in** `backend/src/pdf/templates/` and `backend/src/engine/guidance/` (ADR-4). The model reads guidance strings verbatim via the `get_guidance` tool; it never composes law.
- **Never add network calls to government domains** (cybercrime.gov.in, CFCFRMS, UIDAI, banks, platforms). Mock plane only.
- **Never store full Aadhaar/card numbers** — the redaction utils in `backend/src/lib/redact.ts` must wrap every persist of free text (transcripts, tool_calls, event payloads, logs). Aadhaar → last-4 only.
- Tool handlers stay fast (<400ms p95): no LLM calls inside `backend/src/agent/toolHandlers.ts`. Registration immediates (PDFs, emails) run in the background.
- **Every state change goes through `backend/src/engine/transitions.ts` (`setStatus`)** — the §16.2 transition table is the only authority; anything else must 409.
- The model has zero write access to status fields (ADR-5): freezes, FIRs, resolution are ops-console-only.
- Authority-facing documents (SHO/SP/magistrate/CERT-In/platform letters) are downloads/drafts only; outbound email goes solely to the complainant (+ optional ops BCC) — house rule, stricter than the brief.

## Definition of done per task
Types clean (`npm run typecheck`) · unit test added for engine/lib changes (`npm test`) · a drill note in `qa/drills.md` if the change is voice-facing.
