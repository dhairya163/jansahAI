import { createHash, timingSafeEqual } from 'node:crypto';

import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { z } from 'zod';

import {
  applyIntakeExtraction,
  applyPendingAnswerFallback,
  confirmationReply,
  correctionReply,
  extractIntakeTurn,
  fallbackExtraction,
  nextRequiredField,
  openingReply,
  questionReply,
  registeredReply,
  type OrchestratorDraft,
} from './agent/orchestrator.js';
import { createRealtimeCall, voiceCapability } from './agent/realtime.js';
import { config } from './config.js';
import { repository } from './db/repository.js';
import type { VoiceLanguage, VoiceSessionMessage, VoiceToolCall } from './domain/types.js';
import { getGuidance } from './engine/guidance.js';
import { playbooks } from './engine/playbooks.js';
import { id, sessionToken } from './lib/ids.js';
import { normalizeSuspect, redactSensitive } from './lib/redact.js';
import { ensureSeedData } from './seed.js';
import { renderArtifact } from './services/artifacts.js';
import { createStatusOtp, getCaseAuthorized, getCaseBundle, listOpsCases, mutateCase, registerCase, runAllTicks, signCaseToken, verifyCaseToken, verifyStatusOtp } from './services/cases.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.frontendUrl, credentials: false, allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token', 'X-Cron-Secret'] }));

type Draft = OrchestratorDraft & {
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  language: VoiceLanguage;
  category?: string;
  anonymous?: boolean;
  onBehalfOf?: boolean;
  slots: Record<string, unknown>;
  contact: Record<string, string>;
  otpVerified: boolean;
  caseId?: string;
  caseNumber?: string;
  transcript: VoiceSessionMessage[];
  toolCalls: VoiceToolCall[];
};
const sessions = new Map<string, Draft>();
const rateBuckets = new Map<string, number[]>();

const rateLimit = (key: string, limit: number, windowMs: number) => {
  const now = Date.now(); const recent = (rateBuckets.get(key) ?? []).filter((time) => time > now - windowMs);
  if (recent.length >= limit) throw Object.assign(new Error('Too many attempts. Please wait and try again.'), { statusCode: 429 });
  recent.push(now); rateBuckets.set(key, recent);
};

const safeEqual = (a: string, b: string) => {
  const one = Buffer.from(a); const two = Buffer.from(b); return one.length === two.length && timingSafeEqual(one, two);
};

const requireOps = (req: Request, _res: Response, next: NextFunction) => {
  const expected = `Basic ${Buffer.from(config.opsBasicAuth).toString('base64')}`;
  if (!safeEqual(req.headers.authorization ?? '', expected)) return next(Object.assign(new Error('Ops authentication required'), { statusCode: 401 }));
  next();
};

const requireSession = (req: Request) => {
  const token = req.header('X-Session-Token'); const draft = token ? sessions.get(token) : undefined;
  if (!token || !draft) throw Object.assign(new Error('Valid voice session token required'), { statusCode: 401 });
  return { token, draft };
};

const publicDraft = (draft: Draft) => redactSensitive({
  session_id: draft.sessionId,
  language: draft.language,
  category: draft.category,
  anonymous: draft.anonymous ?? false,
  on_behalf_of: draft.onBehalfOf ?? false,
  slots: draft.slots,
  contact: draft.contact,
  otp_verified: draft.otpVerified,
  case_number: draft.caseNumber,
  awaiting_confirmation: Boolean(draft.awaitingConfirmation),
  pending_field: draft.pendingField,
});

const persistSession = async (token: string, draft: Draft) => {
  const now = new Date().toISOString();
  const minutes = draft.endedAt ? Math.max(0, (Date.parse(draft.endedAt) - Date.parse(draft.startedAt)) / 60_000) : undefined;
  await repository.saveVoiceSession({
    id: draft.sessionId,
    caseId: draft.caseId,
    sessionTokenHash: createHash('sha256').update(token).digest('hex'),
    startedAt: draft.startedAt,
    endedAt: draft.endedAt,
    model: config.realtimeModel,
    voice: config.realtimeVoice,
    language: draft.language,
    minutes,
    status: draft.caseNumber ? 'completed' : draft.endedAt ? 'abandoned' : 'active',
    transcript: draft.transcript,
    toolCalls: draft.toolCalls,
    draft: publicDraft(draft) as Record<string, unknown>,
    updatedAt: now,
  });
};

const toolResponse = async (res: Response, token: string, draft: Draft, name: string, args: Record<string, unknown>, result: unknown) => {
  draft.toolCalls.push({ name, args: redactSensitive(args, name) as Record<string, unknown>, result: redactSensitive(result, name), at: new Date().toISOString() });
  await persistSession(token, draft);
  return res.json({ result, draft: publicDraft(draft), session_id: draft.sessionId });
};

app.get('/health', (_req, res) => res.json({ ok: true, service: 'sahai-backend', demoMode: config.demoMode, database: config.databaseUrl ? 'postgres' : config.supabaseUrl ? 'supabase' : 'memory', voice: voiceCapability() }));

app.post('/api/realtime/session', express.json(), async (req, res, next) => {
  try {
    rateLimit(`session:${req.ip}`, config.maxSessionsPerDay, 86_400_000);
    const token = sessionToken();
    const draft: Draft = { sessionId: id(), startedAt: new Date().toISOString(), language: 'und', slots: {}, contact: {}, otpVerified: false, transcript: [], toolCalls: [] };
    sessions.set(token, draft);
    await persistSession(token, draft);
    res.json({ session_token: token, session_id: draft.sessionId, expires_at: new Date(Date.now() + config.maxSessionMinutes * 60_000).toISOString(), ...voiceCapability() });
  } catch (error) { next(error); }
});

app.post('/api/realtime/connect', express.text({ type: ['application/sdp', 'text/plain'], limit: '128kb' }), async (req, res, next) => {
  try { const { token } = requireSession(req); const answer = await createRealtimeCall(req.body, token); res.type('application/sdp').send(answer); } catch (error) { next(error); }
});

app.use(express.json({ limit: '256kb' }));

app.post('/api/realtime/session/events', async (req, res, next) => {
  try {
    const { token, draft } = requireSession(req);
    const event = z.object({ role: z.enum(['citizen', 'agent']), text: z.string().trim().min(1).max(8_000), item_id: z.string().max(200).optional() }).parse(req.body);
    if (!event.item_id || !draft.transcript.some((item) => item.itemId === event.item_id && item.role === event.role)) {
      draft.transcript.push({ role: event.role, text: String(redactSensitive(event.text, 'transcript')), itemId: event.item_id, at: new Date().toISOString() });
      await persistSession(token, draft);
    }
    res.json({ saved: true, session_id: draft.sessionId });
  } catch (error) { next(error); }
});

app.post('/api/realtime/session/orchestrate', async (req, res, next) => {
  try {
    const { token, draft } = requireSession(req);
    const input = z.object({
      start: z.boolean().optional().default(false),
      transcript: z.string().trim().min(1).max(8_000).optional(),
      item_id: z.string().max(200).optional(),
    }).refine((value) => value.start || Boolean(value.transcript), 'A transcript is required').parse(req.body);

    if (input.start) {
      const itemId = 'orchestrator:opening';
      if (draft.transcript.some((item) => item.itemId === itemId)) {
        return res.json({ duplicate: true, reply: '', draft: publicDraft(draft), session_id: draft.sessionId });
      }
      const reply = openingReply();
      draft.pendingField = 'narrative';
      draft.transcript.push({ role: 'agent', text: reply, itemId, at: new Date().toISOString() });
      await persistSession(token, draft);
      return res.json({ duplicate: false, reply, draft: publicDraft(draft), session_id: draft.sessionId });
    }

    const transcript = input.transcript!;
    if (input.item_id && draft.transcript.some((item) => item.itemId === input.item_id && item.role === 'citizen')) {
      return res.json({ duplicate: true, reply: '', draft: publicDraft(draft), session_id: draft.sessionId });
    }

    draft.transcript.push({ role: 'citizen', text: String(redactSensitive(transcript, 'transcript')), itemId: input.item_id, at: new Date().toISOString() });
    const wasAwaitingConfirmation = Boolean(draft.awaitingConfirmation);
    let usedFallback = false;
    let extraction;
    try {
      extraction = await extractIntakeTurn(transcript, draft, token);
    } catch (error) {
      usedFallback = true;
      console.error('Voice orchestrator fallback:', error);
      extraction = fallbackExtraction(transcript, draft.language);
    }
    applyPendingAnswerFallback(extraction, draft.pendingField, transcript);
    const saved = applyIntakeExtraction(draft, extraction);

    let reply: string;
    let accessToken: string | undefined;
    if (draft.caseNumber) {
      reply = registeredReply(draft.language, draft.caseNumber);
    } else if (wasAwaitingConfirmation && extraction.confirmation === 'yes') {
      if (!draft.category) throw Object.assign(new Error('Category not set'), { statusCode: 422 });
      const result = await registerCase({
        category: draft.category,
        language: draft.language === 'und' ? 'en' : draft.language,
        anonymous: draft.anonymous,
        onBehalfOf: draft.onBehalfOf,
        reporterName: draft.contact.reporter_name,
        victimName: draft.contact.victim_name,
        phone: draft.contact.phone,
        email: draft.contact.email,
        aadhaar: String(draft.slots.aadhaar_last4 ?? ''),
        amount: draft.slots.amount,
        incidentAt: draft.slots.incident_at,
        narrative: draft.slots.narrative,
        slots: draft.slots,
      });
      draft.caseId = result.bundle.case.id;
      draft.caseNumber = result.bundle.case.caseNumber;
      draft.awaitingConfirmation = false;
      draft.pendingField = undefined;
      accessToken = result.accessToken;
      reply = registeredReply(draft.language, draft.caseNumber);
    } else if (wasAwaitingConfirmation && extraction.confirmation === 'no') {
      draft.awaitingConfirmation = false;
      draft.pendingField = 'correction';
      reply = correctionReply(draft.language);
    } else {
      const nextField = nextRequiredField(draft);
      if (nextField) {
        draft.pendingField = nextField;
        reply = questionReply(draft.language, nextField, saved.length);
      } else {
        draft.awaitingConfirmation = true;
        draft.pendingField = 'confirmation';
        reply = confirmationReply(draft);
      }
    }

    const agentItemId = `orchestrator:${input.item_id ?? id()}`;
    draft.transcript.push({ role: 'agent', text: reply, itemId: agentItemId, at: new Date().toISOString() });
    draft.toolCalls.push({
      name: 'orchestrate_turn',
      args: { item_id: input.item_id, model: config.orchestratorModel },
      result: redactSensitive({ saved, language: draft.language, category: draft.category, fallback: usedFallback, registered: Boolean(draft.caseNumber) }),
      at: new Date().toISOString(),
    });
    await persistSession(token, draft);
    res.json({ duplicate: false, reply, draft: publicDraft(draft), session_id: draft.sessionId, access_token: accessToken });
  } catch (error) { next(error); }
});

app.post('/api/realtime/session/end', async (req, res, next) => {
  try {
    const { token, draft } = requireSession(req);
    draft.endedAt ??= new Date().toISOString();
    await persistSession(token, draft);
    sessions.delete(token);
    res.json({ ended: true, session_id: draft.sessionId });
  } catch (error) { next(error); }
});

app.post('/api/tools/:name', async (req, res, next) => {
  try {
    const { token, draft } = requireSession(req); const args = (req.body ?? {}) as Record<string, any>; const name = req.params.name;
    if (name === 'set_session_language') {
      const language = z.enum(['en', 'hi', 'hi-en']).parse(args.language); draft.language = language;
      return toolResponse(res, token, draft, name, args, { language, locked: true });
    }
    if (name === 'classify_category') {
      const category = String(args.category ?? ''); if (!playbooks[category]) throw Object.assign(new Error('Unsupported category'), { statusCode: 422 });
      draft.category = category; draft.anonymous = Boolean(args.anonymous); draft.onBehalfOf = Boolean(args.on_behalf_of);
      return toolResponse(res, token, draft, name, args, { category, required: playbooks[category].slots });
    }
    if (name === 'set_slots') {
      const patch = args.patch && typeof args.patch === 'object' && !Array.isArray(args.patch) ? args.patch : {};
      draft.slots = { ...draft.slots, ...patch };
      const missing = draft.category ? playbooks[draft.category].slots.filter((key) => !key.endsWith('?') && draft.slots[key] == null) : [];
      return toolResponse(res, token, draft, name, args, { saved: Object.keys(patch), missing });
    }
    if (name === 'capture_contact') {
      draft.contact = { ...draft.contact, ...Object.fromEntries(Object.entries(args).filter(([, value]) => typeof value === 'string')) };
      return toolResponse(res, token, draft, name, args, { saved: Object.keys(args) });
    }
    if (name === 'send_aadhaar_otp') {
      draft.slots.aadhaar_last4 = args.aadhaar_last4;
      return toolResponse(res, token, draft, name, args, { sent: true, demo_code: config.demoMode ? config.otpCode : undefined });
    }
    if (name === 'verify_otp') {
      draft.otpVerified = String(args.code) === config.otpCode; if (!draft.otpVerified) throw Object.assign(new Error('Incorrect OTP'), { statusCode: 401 });
      return toolResponse(res, token, draft, name, args, { verified: true });
    }
    if (name === 'check_suspect') {
      const matches = await repository.findSuspects(args.kind, normalizeSuspect(String(args.value ?? '')));
      return toolResponse(res, token, draft, name, args, { match: matches.length > 0, prior_reports: matches.length });
    }
    if (name === 'get_guidance') {
      const result = getGuidance(playbooks[args.category]?.guidance ?? []);
      return toolResponse(res, token, draft, name, args, result);
    }
    if (name === 'register_case') {
      if (!draft.category) throw Object.assign(new Error('Category not set'), { statusCode: 422 });
      const result = await registerCase({ category: draft.category, language: draft.language === 'und' ? 'en' : draft.language, anonymous: draft.anonymous, onBehalfOf: draft.onBehalfOf, reporterName: draft.contact.reporter_name, victimName: draft.contact.victim_name, phone: draft.contact.phone, email: draft.contact.email, aadhaar: String(draft.slots.aadhaar_last4 ?? ''), amount: draft.slots.amount, incidentAt: draft.slots.incident_at, narrative: draft.slots.narrative ?? 'Complaint narrative collected through the Jansah.AI voice intake flow.', slots: draft.slots });
      draft.caseId = result.bundle.case.id; draft.caseNumber = result.bundle.case.caseNumber;
      return toolResponse(res, token, draft, name, args, { case_number: draft.caseNumber, artifacts: result.bundle.artifacts, access_token: result.accessToken });
    }
    throw Object.assign(new Error('Unknown tool'), { statusCode: 404 });
  } catch (error) { next(error); }
});

app.post('/api/intake/register', async (req, res, next) => { try { rateLimit(`register:${req.ip}`, 20, 60 * 60_000); res.status(201).json(await registerCase(req.body)); } catch (error) { next(error); } });

app.post('/api/cases/:caseNumber/otp', async (req, res, next) => { try { rateLimit(`otp:${req.ip}:${req.params.caseNumber}`, 3, 15 * 60_000); res.json(await createStatusOtp(req.params.caseNumber)); } catch (error) { next(error); } });
app.post('/api/cases/:caseNumber/verify', async (req, res, next) => { try { const body = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(req.body); res.json(await verifyStatusOtp(req.params.caseNumber, body.code)); } catch (error) { next(error); } });
app.get('/api/cases/:caseNumber', async (req, res, next) => { try { const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? ''; res.json(await getCaseAuthorized(req.params.caseNumber, token)); } catch (error) { next(error); } });

app.get('/api/artifacts/:artifactId', async (req, res, next) => {
  try {
    const token = req.query.token ? String(req.query.token) : req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const opsExpected = `Basic ${Buffer.from(config.opsBasicAuth).toString('base64')}`; const isOps = safeEqual(req.headers.authorization ?? '', opsExpected);
    const cases = await repository.listCases(); let record; let artifact;
    for (const item of cases) { const found = (await repository.listArtifacts(item.id)).find((entry) => entry.id === req.params.artifactId); if (found) { record = item; artifact = found; break; } }
    if (!record || !artifact) throw Object.assign(new Error('Artifact not found'), { statusCode: 404 });
    if (!isOps) { if (!token) throw Object.assign(new Error('Case access token required'), { statusCode: 401 }); const payload = verifyCaseToken(token); if (payload.case_id !== record.id) throw Object.assign(new Error('Token does not match this case'), { statusCode: 403 }); }
    const buffer = await renderArtifact(record, artifact.kind); res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="${record.caseNumber}-${artifact.kind}.pdf"`); res.send(buffer);
  } catch (error) { next(error); }
});

app.get('/api/ops/cases', requireOps, async (_req, res, next) => { try { const cases = await listOpsCases(); const emails = await repository.listEmails(); res.json({ cases, usage: { sessionsToday: sessions.size, minutesToday: 0, emailsToday: emails.filter((item) => item.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).length } }); } catch (error) { next(error); } });
app.post('/api/ops/cases/:id/:action', requireOps, async (req, res, next) => { try { res.json(await mutateCase(String(req.params.id), String(req.params.action), req.body ?? {})); } catch (error) { next(error); } });
app.post('/api/jobs/tick', async (req, res, next) => { try { const isOps = req.headers.authorization === `Basic ${Buffer.from(config.opsBasicAuth).toString('base64')}`; if (!isOps && req.header('X-Cron-Secret') !== config.cronSecret) throw Object.assign(new Error('Job authentication required'), { statusCode: 401 }); res.json(await runAllTicks()); } catch (error) { next(error); } });

app.get('/api/demo/cases', async (_req, res, next) => { try { if (!config.demoMode) throw Object.assign(new Error('Demo mode is disabled'), { statusCode: 404 }); const cases = await repository.listCases(); res.json({ cases: await Promise.all(cases.filter((item) => item.keepForDemo).map((item) => getCaseBundle(item).then((bundle) => ({ ...bundle, accessToken: signCaseToken(item.id) })))) }); } catch (error) { next(error); } });
app.post('/api/demo/cases/:id/advance-time', async (req, res, next) => { try { if (!config.demoMode) throw Object.assign(new Error('Demo mode is disabled'), { statusCode: 404 }); const record = await repository.getCaseById(String(req.params.id)); if (!record?.keepForDemo) throw Object.assign(new Error('Demo case not found'), { statusCode: 404 }); res.json(await mutateCase(record.id, 'advance-time', { days: Number(req.body?.days ?? 1) })); } catch (error) { next(error); } });

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = typeof error === 'object' && error && 'statusCode' in error ? Number((error as { statusCode: number }).statusCode) : error instanceof z.ZodError ? 422 : 500;
  const message = error instanceof z.ZodError ? error.issues.map((issue) => issue.message).join('; ') : error instanceof Error ? error.message : 'Unexpected server error';
  if (status >= 500) console.error(error);
  res.status(status).json({ error: { code: status === 422 ? 'VALIDATION_ERROR' : status === 401 ? 'UNAUTHORIZED' : 'REQUEST_FAILED', message } });
});

await ensureSeedData();
app.listen(config.port, () => console.log(`SahAI backend listening on http://localhost:${config.port}`));
