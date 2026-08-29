import { Router, type Request, type Response } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cases, caseEvents, artifacts, otpChallenges, type CaseRow } from '../db/schema.js';
import { config } from '../config.js';
import { isCaseNumber, sha256 } from '../lib/ids.js';
import { signCaseToken, verifyCaseToken } from '../lib/jwt.js';
import { rateLimit } from '../lib/rateLimit.js';
import { clientIp } from '../middleware/auth.js';
import { evaluateClocks, nextClock, virtualDay, advanceTime, jumpToNextClock } from '../engine/clocks.js';
import { humanizeEvent, timelineTimestamp } from '../engine/events.js';
import { statusLabel, categoryLabel } from '../engine/labels.js';
import { getPlaybook } from '../engine/playbooks.js';
import { getGuidanceList, ezeroDynamicLine } from '../engine/guidance/index.js';
import { ARTIFACT_LABELS } from '../pdf/render.js';

export const casesRouter = Router();

async function findCase(caseNumber: string): Promise<CaseRow | null> {
  if (!isCaseNumber(caseNumber)) return null;
  const [c] = await db.select().from(cases).where(eq(cases.caseNumber, caseNumber));
  return c ?? null;
}

/** §19 POST /api/cases/:caseNumber/otp — rate 3/15min/IP+case, global 30/hr/IP. */
casesRouter.post('/:caseNumber/otp', async (req, res) => {
  const ip = clientIp(req);
  if (!rateLimit(`otp-global:${ip}`, 30, 60 * 60_000) ||
      !rateLimit(`otp:${ip}:${req.params.caseNumber}`, 3, 15 * 60_000)) {
    res.status(429).json({ error: { code: 'rate_limited', message: 'Too many OTP requests — wait 15 minutes.' } });
    return;
  }
  const c = await findCase(req.params.caseNumber);
  if (!c || c.status === 'draft') {
    res.status(404).json({ error: { code: 'not_found', message: 'No case with that number.' } });
    return;
  }
  await db.insert(otpChallenges).values({
    purpose: 'status_lookup', caseId: c.id,
    codeHash: sha256(config.otpFixedCode + config.jwtSecret),
    expiresAt: new Date(Date.now() + 15 * 60_000),
  });
  res.json({
    sent: true,
    phone_masked: c.phoneMasked ?? null,
    ...(config.demoMode ? { demo_code: config.otpFixedCode } : {}),   // drives the on-screen SMS toast
  });
});

/** §19 POST /api/cases/:caseNumber/verify {code} → {token (30m)} */
casesRouter.post('/:caseNumber/verify', async (req, res) => {
  const c = await findCase(req.params.caseNumber);
  if (!c) {
    res.status(404).json({ error: { code: 'not_found', message: 'No case with that number.' } });
    return;
  }
  const code = String((req.body as { code?: string }).code ?? '');
  const [ch] = await db.select().from(otpChallenges)
    .where(eq(otpChallenges.caseId, c.id))
    .orderBy(desc(otpChallenges.createdAt)).limit(1);
  if (!ch || ch.purpose !== 'status_lookup' || ch.expiresAt < new Date()) {
    res.status(401).json({ error: { code: 'no_challenge', message: 'Request a fresh OTP.' } });
    return;
  }
  if (ch.attempts >= 3) {
    res.status(429).json({ error: { code: 'locked', message: 'Too many attempts — locked for 15 minutes.' } });
    return;
  }
  const ok = sha256(code + config.jwtSecret) === ch.codeHash;
  await db.update(otpChallenges).set({
    attempts: ch.attempts + 1, ...(ok ? { consumedAt: new Date() } : {}),
  }).where(eq(otpChallenges.id, ch.id));
  if (!ok) {
    res.status(401).json({ error: { code: 'wrong_code', message: 'Wrong code.' }, attempts_left: Math.max(0, 2 - ch.attempts) });
    return;
  }
  res.json({ token: signCaseToken(c.id), expires_in: 1800 });
});

function authedCase(req: Request, res: Response, c: CaseRow): boolean {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : String(req.query.token ?? '');
  const payload = token ? verifyCaseToken(token) : null;
  if (!payload || payload.case_id !== c.id) {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Case token required (verify OTP first).' } });
    return false;
  }
  return true;
}

/** §19 GET /api/cases/:caseNumber → {case, timeline, artifacts, next_clock, guidance} */
casesRouter.get('/:caseNumber', async (req, res) => {
  const c0 = await findCase(req.params.caseNumber);
  if (!c0) {
    res.status(404).json({ error: { code: 'not_found', message: 'No case with that number.' } });
    return;
  }
  if (!authedCase(req, res, c0)) return;

  await evaluateClocks(c0.id);          // lazy guarantee — clocks run on any case read (§20)
  const [c] = await db.select().from(cases).where(eq(cases.id, c0.id));
  if (!c) { res.status(404).json({ error: { code: 'not_found', message: 'Gone.' } }); return; }

  const evs = await db.select().from(caseEvents)
    .where(eq(caseEvents.caseId, c.id)).orderBy(desc(caseEvents.createdAt)).limit(100);
  const arts = await db.select().from(artifacts).where(eq(artifacts.caseId, c.id)).orderBy(desc(artifacts.createdAt));
  const nc = await nextClock(c);
  const pb = getPlaybook(c.category);
  const guidance = getGuidanceList(pb?.guidance ?? []).map((g) => ({
    key: g.key,
    en: g.key === 'ezero_fir'
      ? { ...g.en, body: `${g.en.body} ${ezeroDynamicLine(c.amountLost !== null ? Number(c.amountLost) : null).en}` }
      : g.en,
    hi: g.key === 'ezero_fir'
      ? { ...g.hi, body: `${g.hi.body} ${ezeroDynamicLine(c.amountLost !== null ? Number(c.amountLost) : null).hi}` }
      : g.hi,
  }));

  res.json({
    case: {
      id: c.id,
      case_number: c.caseNumber,
      track: c.track,
      category: c.category,
      category_label: categoryLabel(c.category),
      status: c.status,
      status_label: statusLabel(c.status),
      substatus: c.substatus,
      language: c.language,
      anonymous: c.anonymous,
      amount_lost: c.amountLost !== null ? Number(c.amountLost) : null,
      amount_held: c.amountHeld !== null ? Number(c.amountHeld) : null,
      fir_number: c.firNumber,
      virtual_day: virtualDay(c),
      time_offset_days: c.timeOffsetDays,
      registered_at: c.registeredAt,
      email_on_file: !!c.email,
    },
    timeline: evs.map((e) => {
      const line = humanizeEvent(e);
      return { ...line, when: timelineTimestamp(line) };
    }),
    artifacts: arts.map((a) => ({
      id: a.id, kind: a.kind,
      label_en: ARTIFACT_LABELS[a.kind as keyof typeof ARTIFACT_LABELS]?.en ?? a.kind,
      label_hi: ARTIFACT_LABELS[a.kind as keyof typeof ARTIFACT_LABELS]?.hi ?? a.kind,
      created_at: a.createdAt,
      meta: { platforms: (a.meta as Record<string, unknown>)?.platforms, body_text: (a.meta as Record<string, unknown>)?.body_text },
    })),
    next_clock: nc,
    guidance,
    demo_mode: config.demoMode,
  });
});

/** §8.3 citizen action: request restoration once an amount is held (case-JWT gated). */
casesRouter.post('/:caseNumber/restoration', async (req, res) => {
  const c = await findCase(req.params.caseNumber);
  if (!c) { res.status(404).json({ error: { code: 'not_found', message: 'No case.' } }); return; }
  if (!authedCase(req, res, c)) return;
  if (!c.amountHeld) {
    res.status(409).json({ error: { code: 'no_hold', message: 'No amount is held on this case yet.' } });
    return;
  }
  const { generateArtifact } = await import('../pdf/render.js');
  const { addEvent } = await import('../engine/events.js');
  const art = await generateArtifact(c, 'restoration_request');
  await addEvent(c.id, 'restoration_requested', 'citizen', { amount_held: Number(c.amountHeld) });
  res.json({ ok: true, artifact_id: art.id });
});

/** Demo time machine on the case page (?demo=1) — case-JWT gated, DEMO_MODE only (§12.3). */
casesRouter.post('/:caseNumber/demo/:action', async (req, res) => {
  if (!config.demoMode) {
    res.status(403).json({ error: { code: 'demo_off', message: 'DEMO_MODE is off.' } });
    return;
  }
  const c = await findCase(req.params.caseNumber);
  if (!c) { res.status(404).json({ error: { code: 'not_found', message: 'No case.' } }); return; }
  if (!authedCase(req, res, c)) return;

  const action = req.params.action;
  if (action === 'advance') {
    const days = Math.max(1, Math.min(60, Number((req.body as { days?: number }).days ?? 1)));
    const out = await advanceTime(c.id, days);
    res.json(out);
  } else if (action === 'jump') {
    const out = await jumpToNextClock(c.id);
    res.json(out ?? { offset: c.timeOffsetDays, fired: [], note: 'no pending clocks' });
  } else if (action === 'tick') {
    const fired = await evaluateClocks(c.id);
    res.json({ fired });
  } else {
    res.status(404).json({ error: { code: 'bad_action', message: 'advance | jump | tick' } });
  }
});
