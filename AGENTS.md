# SahAI engineering rules

SahAI is an independent voice-first cyber-complaint prototype. Read `spec/cyber-voice-agent-spec.md` before changing product behavior.

- TypeScript strict; Zod validates every API and agent boundary.
- The Next.js frontend calls only the Node.js backend. Supabase, Resend, OpenAI, PDF generation, secrets, and case-state changes are backend-only.
- Government, bank, police, UIDAI, platform, and telecom systems are always mocked. Never add network calls to government domains.
- Never store full Aadhaar, card numbers, passwords, PINs, CVVs, real OTPs, or audio. Run persisted text through `src/lib/redact.ts`.
- Legal text lives only in PDF templates and guidance catalogues. The voice model must not invent legal guidance.
- The model cannot confirm freezes, register FIRs, or change case status. Those transitions require guarded backend ops actions.
- Authority-facing letters are generated as drafts/downloads only and are never emailed to authorities.
- Definition of done: types clean, relevant tests pass, all touch targets work by keyboard and touch, and the prototype disclaimer remains visible.
