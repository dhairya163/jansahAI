import { Router } from 'express';
import { and, desc, eq, gte, ilike, lt, ne, or, sql as dsql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cases, caseEvents, artifacts, voiceSessions, emails, clocks, type CaseRow } from '../db/schema.js';
import { config } from '../config.js';
import { opsBasicAuth, opsOrCronAuth } from '../middleware/auth.js';
import { addEvent } from '../engine/events.js';
import { setStatus, isActive, TransitionError } from '../engine/transitions.js';
import { evaluateClocks, nextClock, advanceTime, jumpToNextClock, virtualDay } from '../engine/clocks.js';
import { humanizeEvent, timelineTimestamp } from '../engine/events.js';
import { categoryLabel, statusLabel } from '../engine/labels.js';
import { generateArtifact, ARTIFACT_LABELS } from '../pdf/render.js';
import { sendCaseEmail } from '../email/send.js';
import { formatINR } from '../lib/normalize.js';

export const opsRouter = Router();
opsRouter.use(opsBasicAuth);

async function caseById(id: string): Promise<CaseRow | null> {
  const [c] = await db.select().from(cases).where(eq(cases.id, id));
  return c ?? null;
}

/** §19 GET /api/ops/cases?status=&q= */
opsRouter.get('/cases', async (req, res) => {
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : null;
  const track = typeof req.query.track === 'string' && req.query.track ? req.query.track : null;
  const q = typeof req.query.q === 'string' && req.query.q ? req.query.q : null;

  const rows = await db.select().from(cases)
    .where(and(
      ne(cases.status, 'draft'),
      status ? eq(cases.status, status) : undefined,
      track ? eq(cases.track, track) : undefined,
      q ? or(ilike(cases.caseNumber, `%${q}%`), ilike(cases.category, `%${q}%`), ilike(cases.reporterName, `%${q}%`)) : undefined,
    ))
    .orderBy(desc(cases.createdAt)).limit(100);

  const out = await Promise.all(rows.map(async (c) => {
    const nc = await nextClock(c);
    return {
      id: c.id, case_number: c.caseNumber,
      category: c.category, category_label: categoryLabel(c.category),
      track: c.track, status: c.status, status_label: statusLabel(c.status),
      substatus: c.substatus, anonymous: c.anonymous,
      amount_lost: c.amountLost !== null ? Number(c.amountLost) : null,
      amount_held: c.amountHeld !== null ? Number(c.amountHeld) : null,
      created_at: c.createdAt, virtual_day: virtualDay(c),
      keep_for_demo: c.keepForDemo,
      next_clock: nc ? { label: nc.label_en, in_days: nc.in_days_virtual, step_key: nc.step_key } : null,
    };
  }));
  res.json({ cases: out });
});

/** Drawer detail. */
opsRouter.get('/cases/:id', async (req, res) => {
  const c = await caseById(req.params.id);
  if (!c) { res.status(404).json({ error: { code: 'not_found', message: 'No case.' } }); return; }
  await evaluateClocks(c.id);
  const evs = await db.select().from(caseEvents).where(eq(caseEvents.caseId, c.id)).orderBy(desc(caseEvents.createdAt)).limit(100);
  const arts = await db.select().from(artifacts).where(eq(artifacts.caseId, c.id));
  const clks = await db.select().from(clocks).where(eq(clocks.caseId, c.id));
  res.json({
    case: {
      ...c,
      amount_lost: c.amountLost !== null ? Number(c.amountLost) : null,
      category_label: categoryLabel(c.category),
      status_label: statusLabel(c.status),
      virtual_day: virtualDay(c),
    },
    timeline: evs.map((e) => { const l = humanizeEvent(e); return { ...l, when: timelineTimestamp(l) }; }),
    artifacts: arts.map((a) => ({
      id: a.id, kind: a.kind,
      label_en: ARTIFACT_LABELS[a.kind as keyof typeof ARTIFACT_LABELS]?.en ?? a.kind,
      created_at: a.createdAt,
    })),
    clocks: clks.map((k) => ({ step_key: k.stepKey, due_days: k.dueDays, condition: k.condition, status: k.status })),
  });
});

function opsError(res: import('express').Response, err: unknown): void {
  if (err instanceof TransitionError) {
    res.status(409).json({ error: { code: 'illegal_transition', message: err.message } });
  } else {
    console.error('[ops]', err);
    res.status(500).json({ error: { code: 'internal', message: (err as Error).message } });
  }
}

/** §19 ops mutations — every action = case_event actor 'ops' + clock re-evaluation (lazy guarantee). */
opsRouter.post('/cases/:id/:action', async (req, res) => {
  const c = await caseById(req.params.id);
  if (!c) { res.status(404).json({ error: { code: 'not_found', message: 'No case.' } }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;

  try {
    switch (req.params.action) {
      case 'advance-time': {
        const days = Math.max(1, Math.min(90, Number(body.days ?? 1)));
        const out = await advanceTime(c.id, days);
        res.json({ case_id: c.id, ...out });
        return;
      }
      case 'jump-next-clock': {
        const out = await jumpToNextClock(c.id);
        res.json(out ?? { offset: c.timeOffsetDays, fired: [], note: 'no pending clocks' });
        return;
      }
      case 'freeze-confirm': {
        if (c.track !== 'financial') throw new TransitionError(c.status, 'under_process');
        const amountHeld = Number(body.amount_held);
        if (!Number.isFinite(amountHeld) || amountHeld <= 0) {
          res.status(422).json({ error: { code: 'bad_amount', message: 'amount_held required' } });
          return;
        }
        await db.update(cases).set({
          amountHeld: String(amountHeld),
          substatus: `${formatINR(amountHeld)} held at beneficiary bank`,
          updatedAt: new Date(),
        }).where(eq(cases.id, c.id));
        await addEvent(c.id, 'freeze_confirmed', 'ops', { amount_held: amountHeld });
        await addEvent(c.id, 'restoration_offered', 'ops', { amount_held: amountHeld });
        const [c2] = await db.select().from(cases).where(eq(cases.id, c.id));
        if (c2) {
          await generateArtifact(c2, 'restoration_request');
          await sendCaseEmail(c2, 'restoration', { amountHeld });
        }
        await evaluateClocks(c.id);
        res.json({ ok: true, amount_held: amountHeld });
        return;
      }
      case 'mark-fir': {
        const firNumber = String(body.fir_number ?? '').trim();
        if (!firNumber) {
          res.status(422).json({ error: { code: 'bad_fir', message: 'fir_number required' } });
          return;
        }
        await db.update(cases).set({ firNumber, updatedAt: new Date() }).where(eq(cases.id, c.id));
        const updated = await setStatus(c, 'fir_registered', 'ops', { substatus: `FIR ${firNumber}` });
        await addEvent(c.id, 'fir_marked', 'ops', { fir_number: firNumber });
        await sendCaseEmail(updated, 'status', {
          statusLine: {
            en: `An FIR (${firNumber}) has been registered on your complaint — the investigation can now formally begin.`,
            hi: `आपकी शिकायत पर FIR (${firNumber}) दर्ज हो गई है — अब औपचारिक जाँच शुरू हो सकती है।`,
          },
        });
        await evaluateClocks(c.id);
        res.json({ ok: true });
        return;
      }
      case 'resolve': {
        const note = String(body.note ?? '').trim();
        const updated = await setStatus(c, 'resolved', 'ops', { eventPayload: { note } });
        if (note) await addEvent(c.id, 'note', 'ops', { text: note });
        await sendCaseEmail(updated, 'status', {
          statusLine: {
            en: `Your case has been marked resolved.${note ? ` Note from the desk: ${note}` : ''}`,
            hi: `आपका केस समाधान चिह्नित हुआ।${note ? ` नोट: ${note}` : ''}`,
          },
        });
        res.json({ ok: true });
        return;
      }
      case 'close': {
        const note = String(body.note ?? '').trim();
        await setStatus(c, 'closed', 'ops', { eventPayload: { note } });
        if (note) await addEvent(c.id, 'note', 'ops', { text: note });
        res.json({ ok: true });
        return;
      }
      case 'note': {
        const text = String(body.text ?? '').trim();
        if (!text) { res.status(422).json({ error: { code: 'bad_note', message: 'text required' } }); return; }
        await addEvent(c.id, 'note', 'ops', { text });
        await evaluateClocks(c.id);
        res.json({ ok: true });
        return;
      }
      case 'platform-ack': {
        await addEvent(c.id, 'platform_ack', 'ops', {});
        await evaluateClocks(c.id);
        res.json({ ok: true });
        return;
      }
      case 'content-removed': {
        await addEvent(c.id, 'content_removed', 'ops', {});
        await evaluateClocks(c.id);
        res.json({ ok: true });
        return;
      }
      case 'restore': {
        const amount = Number(body.amount ?? c.amountHeld ?? 0);
        await addEvent(c.id, 'amount_restored', 'ops', { amount });
        await db.update(cases).set({ substatus: `${formatINR(amount)} restored to source account`, updatedAt: new Date() })
          .where(eq(cases.id, c.id));
        await evaluateClocks(c.id);
        res.json({ ok: true });
        return;
      }
      default:
        res.status(404).json({ error: { code: 'bad_action', message: 'Unknown ops action.' } });
        return;
    }
  } catch (err) {
    opsError(res, err);
  }
});

/** §24 usage widget + §28 cost guards. */
opsRouter.get('/usage', async (_req, res) => {
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const sessions = await db.select().from(voiceSessions).where(gte(voiceSessions.startedAt, midnight));
  const minutes = sessions.reduce((acc, s2) => acc + Number(s2.minutes ?? 0), 0);
  const [emailRow] = await db.select({ n: dsql<number>`count(*)::int` }).from(emails).where(gte(emails.createdAt, midnight));
  const estCostInr = Math.round(minutes * 25);   // rough ₹/min guardrail number for the widget
  res.json({
    sessions_today: sessions.length,
    minutes_today: Math.round(minutes * 10) / 10,
    emails_today: emailRow?.n ?? 0,
    est_cost_inr: estCostInr,
    caps: { max_sessions_per_day: config.maxSessionsPerDay, max_session_minutes: config.maxSessionMinutes },
    alert: sessions.length >= config.maxSessionsPerDay * 0.8,
  });
});

/** §25.4 purge — deletes cases older than PURGE_DAYS unless keep_for_demo. */
opsRouter.post('/purge', async (_req, res) => {
  const cutoff = new Date(Date.now() - config.purgeDays * 86_400_000);
  const removed = await db.delete(cases)
    .where(and(lt(cases.createdAt, cutoff), eq(cases.keepForDemo, false)))
    .returning({ id: cases.id });
  res.json({ purged: removed.length, cutoff: cutoff.toISOString() });
});

/** §19 POST /api/jobs/tick (ops | CRON_SECRET) → evaluate every active case. */
export const jobsRouter = Router();
jobsRouter.post('/tick', opsOrCronAuth, async (_req, res) => {
  const active = await db.select().from(cases)
    .where(dsql`${cases.status} in ('registered','under_process','stalled','escalated_l1','escalated_l2')`);
  const firedAll: Record<string, string[]> = {};
  for (const c of active) {
    const fired = await evaluateClocks(c.id);
    if (fired.length > 0) firedAll[c.caseNumber] = fired;
  }
  res.json({ evaluated: active.length, fired: firedAll });
});
