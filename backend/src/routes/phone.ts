import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { and, desc, eq, gte, inArray, lt, sql as dsql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { voiceSessions, cases, handoffs } from '../db/schema.js';
import { config } from '../config.js';
import { randomToken, sha256 } from '../lib/ids.js';
import { maskPhone } from '../lib/normalize.js';
import { rateLimit } from '../lib/rateLimit.js';
import { clientIp } from '../middleware/auth.js';
import { broadcast } from '../lib/supabase.js';
import { signCaseToken } from '../lib/jwt.js';
import { twilioConfigured, twilioCreateCall, twilioAccountType, toIndianE164 } from '../lib/twilio.js';
import { acceptSipCall, rejectSipCall, sipUri, verifyOpenAIWebhook } from '../agent/realtime.js';
import { PhoneRunner } from '../agent/phoneRunner.js';
import { TurnRunner, REPROMPT, phoneRunnerFor } from '../agent/turnRunner.js';

export const phoneRouter = Router();

const sig = (sessionId: string) => crypto.createHmac('sha256', config.jwtSecret).update(`phone:${sessionId}`).digest('hex').slice(0, 24);
const checkSig = (req: Request): string | null => {
  const s = String(req.query.s ?? ''); const t = String(req.query.t ?? '');
  return s && t && sig(s) === t ? s : null;
};

function phoneReady(): { ok: boolean; why?: string } {
  if (!twilioConfigured()) return { ok: false, why: 'Twilio credentials missing' };
  if (!config.twilioNumber) return { ok: false, why: 'No Twilio number configured' };
  if (!config.openaiProjectId) return { ok: false, why: 'OPENAI_PROJECT_ID missing' };
  return { ok: true };
}

/** 'sip' = OpenAI Realtime over SIP; 'twiml' = trial-safe speech loop (Twilio trials strip <Dial><Sip>). */
let bridgeCache: { mode: 'sip' | 'twiml'; at: number } | null = null;
async function bridgeMode(): Promise<'sip' | 'twiml'> {
  if (config.phoneBridge !== 'auto') return config.phoneBridge;
  if (bridgeCache && Date.now() - bridgeCache.at < 10 * 60_000) return bridgeCache.mode;
  let mode: 'sip' | 'twiml' = 'sip';
  try { if (/trial/i.test(await twilioAccountType())) mode = 'twiml'; } catch { /* provider without account type → sip */ }
  bridgeCache = { mode, at: Date.now() };
  return mode;
}

const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const say = (t: string, voice = config.phoneTtsVoice) => `<Say voice="${voice}" language="${config.phoneTtsLang}">${xml(t)}</Say>`;
const turnUrl = (sessionId: string, path = 'turn') => `${config.publicApiUrl}/api/phone/${path}?s=${sessionId}&t=${sig(sessionId)}`;
const HINTS = 'UPI, OTP, Aadhaar, KYC, SBI, HDFC, ICICI, Paytm, PhonePe, Google Pay, lakh, rupees, FIR, WhatsApp, Instagram, Telegram';
/** Speak, then listen: Twilio transcribes the caller and POSTs SpeechResult to /turn. */
const gatherTwiml = (sessionId: string, text: string, voice?: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" language="${config.phoneSttLang}" speechModel="${config.phoneSttModel}" ` +
  `speechTimeout="auto" timeout="6" actionOnEmptyResult="true" hints="${xml(HINTS)}" action="${xml(turnUrl(sessionId))}" method="POST">${say(text, voice)}</Gather></Response>`;
const byeTwiml = (text: string, voice?: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${say(text, voice)}<Hangup/></Response>`;
/** The model is still working: a short filler (first time) or a beat of silence, then poll /turn-result again. */
const waitTwiml = (sessionId: string, first: boolean) =>
  `<?xml version="1.0" encoding="UTF-8"?><Response>${first ? say('जी, एक पल।') : '<Pause length="1"/>'}<Redirect method="POST">${xml(turnUrl(sessionId, 'turn-result'))}</Redirect></Response>`;

const GREET_OUTBOUND = 'नमस्ते, मैं जनसह बोल रही हूँ। आपने वेबसाइट पर कॉल रिक्वेस्ट की थी। मैं एक इंडिपेंडेंट सेवा हूँ। बोलिए, क्या हुआ?';
const GREET_INBOUND = 'नमस्ते, जनसह में आपका स्वागत है। मैं एक इंडिपेंडेंट सेवा हूँ। बोलिए, क्या हुआ?';

/** Channel instructions shared by both bridges. */
const phoneExtra = (session: { phoneMasked: string | null }) =>
  'CHANNEL: PHONE CALL. There is no screen: never mention on-screen fields, toasts, typing, or links. ' +
  (session.phoneMasked ? `The caller's phone number is already on file (${session.phoneMasked}) — do not ask for it. ` : '') +
  'When you send the Aadhaar OTP, say it was sent to their registered mobile by SMS and ask them to read it out. ' +
  'Read the case number digit by digit, twice, and offer to email the documents. Keep every turn to one or two short sentences — phone lines feel slow.';

/**
 * Phone sessions are finalized by the in-memory runner (SIP or TwiML). If the process restarts mid-call
 * (deploy, crash) or the carrier never sends a status callback, the row would stay "in_progress" forever —
 * so anything live with no runner behind it is closed here.
 */
const LIVE = ['requested', 'ringing', 'answered', 'in_progress'];
async function closeOrphan(sessionId: string, reason: string): Promise<void> {
  await db.update(voiceSessions).set({ callStatus: 'completed', endedAt: new Date(), phoneE164: null })
    .where(and(eq(voiceSessions.id, sessionId), inArray(voiceSessions.callStatus, LIVE)));
  void broadcast(`session:${sessionId}`, 'call_status', { status: 'completed', reason });
}
async function sweepOrphans(): Promise<void> {
  const stale = new Date(Date.now() - (config.maxSessionMinutes + 2) * 60_000);
  const rows = await db.select({ id: voiceSessions.id }).from(voiceSessions)
    .where(and(eq(voiceSessions.channel, 'phone'), inArray(voiceSessions.callStatus, LIVE), lt(voiceSessions.startedAt, stale)));
  for (const r of rows) if (!phoneRunnerFor(r.id)) await closeOrphan(r.id, 'stale');
}
setInterval(() => { void sweepOrphans().catch((e) => console.warn('[phone] sweep:', (e as Error).message)); }, 60_000).unref();

/** Public readiness + display number for the UI. */
phoneRouter.get('/info', async (_req, res) => {
  const r = phoneReady();
  res.json({ available: r.ok, number: config.twilioNumber || null, reason: r.ok ? null : r.why, bridge: r.ok ? await bridgeMode() : null });
});

/** "Call me" — citizen gives a number + consent; we dial them and bridge to the same agent. */
phoneRouter.post('/callme', async (req, res) => {
  const r = phoneReady();
  if (!r.ok) { res.status(503).json({ error: { code: 'phone_unavailable', message: `Phone line not configured: ${r.why}` } }); return; }
  const body = (req.body ?? {}) as { phone?: string; consent?: boolean };
  const e164 = toIndianE164(String(body.phone ?? ''));
  if (!e164) { res.status(422).json({ error: { code: 'bad_phone', message: 'Enter a valid Indian mobile number (10 digits, starts 6–9).' } }); return; }
  if (body.consent !== true) { res.status(422).json({ error: { code: 'consent', message: 'Consent to receive the call is required.' } }); return; }
  const ip = clientIp(req);
  if (!rateLimit(`callme:ip:${ip}`, 4, 60 * 60_000) || !rateLimit(`callme:num:${e164}`, 3, 60 * 60_000)) {
    res.status(429).json({ error: { code: 'rate_limited', message: 'Too many call requests — try again in an hour.' } }); return;
  }
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const [cnt] = await db.select({ n: dsql<number>`count(*)::int` }).from(voiceSessions).where(gte(voiceSessions.startedAt, midnight));
  if ((cnt?.n ?? 0) >= config.maxSessionsPerDay) {
    res.status(429).json({ error: { code: 'daily_cap', message: 'Daily session cap reached (cost guard).' } }); return;
  }

  const token = randomToken();
  const [session] = await db.insert(voiceSessions).values({
    sessionTokenHash: sha256(token), model: config.realtimeModel,
    channel: 'phone', phoneE164: e164, phoneMasked: maskPhone(e164), consentAt: new Date(), callStatus: 'requested',
  }).returning();

  try {
    const call = await twilioCreateCall({
      to: e164,
      twimlUrl: `${config.publicApiUrl}/api/phone/twiml?s=${session.id}&t=${sig(session.id)}`,
      statusCallback: `${config.publicApiUrl}/api/phone/status?s=${session.id}&t=${sig(session.id)}`,
    });
    await db.update(voiceSessions).set({ twilioCallSid: call.sid, callStatus: 'ringing' }).where(eq(voiceSessions.id, session.id));
    console.log(`[phone] dialing ${maskPhone(e164)} session=${session.id.slice(0, 8)} twilio=${call.sid}`);
    res.json({ session_id: session.id, session_token: token, phone_masked: maskPhone(e164), status: 'ringing' });
  } catch (err) {
    const msg = (err as Error).message;
    await db.update(voiceSessions).set({ callStatus: 'failed', endedAt: new Date(), phoneE164: null }).where(eq(voiceSessions.id, session.id));
    console.warn('[phone] twilio create failed:', msg);
    const hint = /573003|isn't assigned to this verified/i.test(msg)
      ? `Twilio trial: calls to this number must come from the trial number Twilio assigned to it, not ${config.twilioNumber}. Copy the "From" number from Twilio Console → Voice → Try it out → Make a call (or Phone Numbers → Verified Caller IDs) and set TWILIO_NUMBER to it.`
      : /21219|21210|not yet verified|unverified/i.test(msg)
        ? 'This number is not verified on the Twilio trial account yet — verify it in Twilio (or upgrade the account).'
        : msg;
    res.status(502).json({ error: { code: 'dial_failed', message: hint } });
  }
});

/** Twilio fetches this when the citizen picks up: bridge the answered leg into OpenAI's SIP endpoint. */
phoneRouter.post('/twiml', async (req, res) => {
  const sessionId = checkSig(req);
  if (!sessionId) { res.status(403).type('text/xml').send('<Response><Reject/></Response>'); return; }
  const callSid = String((req.body as Record<string, string>)?.CallSid ?? '') || null;
  await db.update(voiceSessions).set({ callStatus: 'answered', ...(callSid ? { twilioCallSid: callSid } : {}) }).where(eq(voiceSessions.id, sessionId));
  if ((await bridgeMode()) === 'twiml') {
    const [session] = await db.select().from(voiceSessions).where(eq(voiceSessions.id, sessionId));
    if (!session) { res.status(404).type('text/xml').send('<Response><Reject/></Response>'); return; }
    const runner = new TurnRunner(session, callSid, phoneExtra(session));
    runner.start();
    runner.greet(GREET_OUTBOUND);
    await db.update(voiceSessions).set({ callStatus: 'in_progress' }).where(eq(voiceSessions.id, sessionId));
    res.type('text/xml').send(gatherTwiml(sessionId, GREET_OUTBOUND));
    return;
  }
  const uri = `${sipUri()}?X-Jansah-Session=${sessionId}`;
  res.type('text/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Dial answerOnBridge="true" timeout="25"><Sip>${uri}</Sip></Dial></Response>`,
  );
});

/** Inbound: someone dials our number → Twilio fetches this → bridge straight into OpenAI SIP (no session tag; the webhook creates one). */
phoneRouter.post('/inbound', async (req, res) => {
  if ((await bridgeMode()) === 'twiml') {
    const body = (req.body ?? {}) as Record<string, string>;
    const fromDigits = String(body.From ?? '').match(/\+?\d{8,15}/)?.[0] ?? null;
    const [session] = await db.insert(voiceSessions).values({
      sessionTokenHash: sha256(randomToken()), model: config.phoneTextModel, channel: 'phone',
      phoneMasked: fromDigits ? maskPhone(fromDigits) : null, twilioCallSid: body.CallSid || null, callStatus: 'in_progress',
    }).returning();
    const runner = new TurnRunner(session, body.CallSid || null, phoneExtra(session));
    runner.start();
    runner.greet(GREET_INBOUND);
    res.type('text/xml').send(gatherTwiml(session.id, GREET_INBOUND));
    return;
  }
  if (!config.openaiProjectId) { res.type('text/xml').send('<Response><Say>This line is not configured yet.</Say></Response>'); return; }
  res.type('text/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Dial answerOnBridge="true" timeout="25"><Sip>${sipUri()}</Sip></Dial></Response>`,
  );
});

const TERMINAL = ['completed', 'busy', 'no-answer', 'failed', 'canceled'];

/** Trial bridge: Twilio posts what the caller said (SpeechResult); we answer with the next thing to say. */
async function respondTurn(res: Response, sessionId: string, runner: TurnRunner, result: { say: string; end: boolean } | null): Promise<void> {
  if (!result) { res.type('text/xml').send(waitTwiml(sessionId, runner.waitCount === 1)); return; }
  if (result.end) { res.type('text/xml').send(byeTwiml(result.say, runner.ttsVoice)); void runner.end('agent_end'); return; }
  res.type('text/xml').send(gatherTwiml(sessionId, result.say, runner.ttsVoice));
}

phoneRouter.post('/turn', async (req, res) => {
  const sessionId = checkSig(req);
  if (!sessionId) { res.status(403).type('text/xml').send('<Response><Reject/></Response>'); return; }
  const body = (req.body ?? {}) as Record<string, string>;
  const runner = TurnRunner.for(sessionId);
  if (!runner) { res.type('text/xml').send(byeTwiml('माफ़ कीजिए, यह कॉल समाप्त हो गई है। कृपया दोबारा कॉल करें।')); return; }
  if (TERMINAL.includes(String(body.CallStatus ?? ''))) { void runner.end(`twilio:${body.CallStatus}`); res.status(204).end(); return; }
  const speech = String(body.SpeechResult ?? '').trim();
  console.log(`[phone/twiml] turn session=${sessionId.slice(0, 8)} heard="${speech.slice(0, 80)}" conf=${body.Confidence ?? '-'}`);
  void runner.turn(speech);
  await respondTurn(res, sessionId, runner, await runner.waitPending(9_000));
});

phoneRouter.post('/turn-result', async (req, res) => {
  const sessionId = checkSig(req);
  if (!sessionId) { res.status(403).type('text/xml').send('<Response><Reject/></Response>'); return; }
  const runner = TurnRunner.for(sessionId);
  if (!runner) { res.type('text/xml').send(byeTwiml('माफ़ कीजिए, यह कॉल समाप्त हो गई है।')); return; }
  const r = await runner.waitPending(9_000);
  await respondTurn(res, sessionId, runner, r ?? (runner.waitCount >= 4 ? { say: REPROMPT, end: false } : null));
});

/** Twilio call-progress callback. */
phoneRouter.post('/status', async (req, res) => {
  const sessionId = checkSig(req);
  res.status(204).end();
  if (!sessionId) return;
  const status = String((req.body as Record<string, string>)?.CallStatus ?? '');
  if (!status) return;
  const terminal = TERMINAL.includes(status);
  const runner = phoneRunnerFor(sessionId);
  if (terminal && runner) { void runner.end(`twilio:${status}`); return; }
  await db.update(voiceSessions).set({
    callStatus: status,
    ...(terminal ? { endedAt: new Date(), phoneE164: null } : {}),
  }).where(eq(voiceSessions.id, sessionId));
  void broadcast(`session:${sessionId}`, 'call_status', { status });
});

/** OpenAI webhook: realtime.call.incoming → accept with our session config → start the runner. */
phoneRouter.post('/openai-webhook', async (req, res) => {
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!raw || !verifyOpenAIWebhook(raw, req.headers as Record<string, string | string[] | undefined>)) {
    res.status(401).json({ error: { code: 'bad_signature', message: 'Webhook signature invalid' } }); return;
  }
  const evt = req.body as { type?: string; data?: { call_id?: string; sip_headers?: { name: string; value: string }[] } };
  if (evt.type !== 'realtime.call.incoming' || !evt.data?.call_id) { res.json({ ok: true, ignored: evt.type }); return; }

  const callId = evt.data.call_id;
  const headers = evt.data.sip_headers ?? [];
  const hdr = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
  const taggedSession = hdr('X-Jansah-Session');
  const from = hdr('From') ?? '';
  const fromDigits = from.match(/\+?\d{8,15}/)?.[0] ?? null;

  let session = taggedSession
    ? (await db.select().from(voiceSessions).where(eq(voiceSessions.id, taggedSession)))[0]
    : undefined;
  if (!session) {
    // fallback: the most recent phone session we dialled in the last 3 minutes
    const [recent] = await db.select().from(voiceSessions)
      .where(and(eq(voiceSessions.channel, 'phone'), inArray(voiceSessions.callStatus, ['ringing', 'answered']),
        gte(voiceSessions.startedAt, new Date(Date.now() - 3 * 60_000))))
      .orderBy(desc(voiceSessions.startedAt)).limit(1);
    session = recent;
  }
  const inbound = !session;
  if (!session) {
    // someone dialled our number directly
    const [row] = await db.insert(voiceSessions).values({
      sessionTokenHash: sha256(randomToken()), model: config.realtimeModel, channel: 'phone',
      phoneMasked: fromDigits ? maskPhone(fromDigits) : null, callStatus: 'in_progress',
    }).returning();
    session = row;
  }
  await db.update(voiceSessions).set({ callId, callStatus: 'in_progress' }).where(eq(voiceSessions.id, session.id));
  session.callId = callId;

  const extra = phoneExtra(session);
  const greeting = inbound
    ? 'The call has just connected (the caller dialled Jansah). Greet warmly in a Hindi-English mix in ONE short line that includes "ek independent seva", then ask "Boliye, kya hua?"'
    : 'The call has just connected. This citizen tapped "Call me" on the Jansah website, so open with: "Namaste, main Jansah bol raha hoon — aapne website par call request ki thi. Main ek independent seva hoon. Boliye, kya hua?" (mirror their language after that).';

  try {
    await acceptSipCall(callId, extra);
  } catch (err) {
    console.error('[phone] accept failed:', (err as Error).message);
    await rejectSipCall(callId, 503);
    res.status(500).json({ error: { code: 'accept_failed', message: (err as Error).message } }); return;
  }
  const runner = new PhoneRunner(session, callId, greeting);
  const [open] = await db.select().from(handoffs).where(and(eq(handoffs.sessionId, session.id), inArray(handoffs.status, ['queued', 'accepted']))).limit(1);
  if (open) runner.setHandoff(open.id);
  runner.start();
  res.json({ ok: true, session_id: session.id, inbound });
});

/** Web page polling fallback for a phone session (X-Session-Token). */
phoneRouter.get('/session', async (req, res) => {
  const token = req.headers['x-session-token'];
  if (typeof token !== 'string') { res.status(401).json({ error: { code: 'unauthorized', message: 'X-Session-Token required' } }); return; }
  const [s] = await db.select().from(voiceSessions).where(eq(voiceSessions.sessionTokenHash, sha256(token))).orderBy(desc(voiceSessions.startedAt)).limit(1);
  if (!s) { res.status(404).json({ error: { code: 'not_found', message: 'No session' } }); return; }
  if (s.callStatus && LIVE.includes(s.callStatus) && !phoneRunnerFor(s.id) && Date.now() - new Date(s.startedAt).getTime() > 90_000) {
    await closeOrphan(s.id, 'no_runner');
    s.callStatus = 'completed'; s.endedAt = new Date();
  }
  let caseNumber: string | null = null; let caseToken: string | null = null;
  if (s.caseId) {
    const [c] = await db.select({ caseNumber: cases.caseNumber, status: cases.status }).from(cases).where(eq(cases.id, s.caseId));
    if (c && c.status !== 'draft') { caseNumber = c.caseNumber; caseToken = signCaseToken(s.caseId); }
  }
  const [open] = await db.select().from(handoffs).where(and(eq(handoffs.sessionId, s.id), inArray(handoffs.status, ['queued', 'accepted']))).limit(1);
  res.json({
    session_id: s.id, status: s.callStatus, phone_masked: s.phoneMasked, ended_at: s.endedAt,
    case_number: caseNumber, case_token: caseToken,
    handoff: open ? { id: open.id, status: open.status, assigned_to: open.assignedTo } : null,
  });
});

/** Ops helper: verify a caller ID on the Twilio trial (returns the code Twilio will ask for). */
export async function opsVerifyCaller(_req: Request, res: Response, phone: string): Promise<void> {
  const { twilioVerifyCallerId } = await import('../lib/twilio.js');
  const e164 = toIndianE164(phone);
  if (!e164) { res.status(422).json({ error: { code: 'bad_phone', message: 'Indian mobile required' } }); return; }
  try {
    const out = await twilioVerifyCallerId(e164);
    res.json({ phone: out.phone_number, validation_code: out.validation_code, note: 'Twilio is calling this number now — enter the code on the keypad.' });
  } catch (err) {
    res.status(502).json({ error: { code: 'twilio', message: (err as Error).message } });
  }
}
