import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { handoffs, handoffMessages, cases, voiceSessions, type HandoffRow, type CaseRow, type VoiceSessionRow } from '../db/schema.js';
import { broadcast } from '../lib/supabase.js';
import { redact, redactDeep } from '../lib/redact.js';
import { addEvent } from './events.js';
import { categoryLabel } from './labels.js';
import { formatINR } from '../lib/normalize.js';
import { chatJson } from '../agent/realtime.js';
import { PhoneRunner } from '../agent/phoneRunner.js';

/**
 * Human handoff — platform-only: the operator works from the ops console. On web calls the
 * citizen chats on the call page; on phone calls the agent speaks the operator's words.
 */

const OPS_TOPIC = 'ops:handoffs';

function quickSummary(c: CaseRow | null, reason: string | undefined): string {
  if (!c) return `Caller asked for a person${reason ? ` — ${reason}` : ''}. No case captured yet.`;
  const slots = (c.slots ?? {}) as Record<string, unknown>;
  const bits = [
    c.category !== 'unclassified' ? categoryLabel(c.category).en : 'uncategorised',
    c.amountLost ? `loss ${formatINR(Number(c.amountLost))}` : null,
    c.aadhaarLast4 ? 'identity verified' : (c.anonymous ? 'anonymous' : 'identity pending'),
    c.status !== 'draft' ? `case ${c.caseNumber} registered` : 'not yet registered',
    slots.narrative ? `story: ${String(slots.narrative).slice(0, 140)}` : null,
  ].filter(Boolean);
  return `${bits.join(' · ')}${reason ? `. Wants: ${reason}` : ''}`;
}

export async function openHandoffForSession(sessionId: string): Promise<HandoffRow | null> {
  const [row] = await db.select().from(handoffs)
    .where(and(eq(handoffs.sessionId, sessionId), inArray(handoffs.status, ['queued', 'accepted'])))
    .orderBy(desc(handoffs.createdAt)).limit(1);
  return row ?? null;
}

export async function requestHandoff(opts: {
  session: VoiceSessionRow; caseRow: CaseRow | null; reason?: string; urgency?: string; source: 'agent' | 'button';
}): Promise<{ handoff: HandoffRow; already: boolean }> {
  const existing = await openHandoffForSession(opts.session.id);
  if (existing) return { handoff: existing, already: true };

  const [row] = await db.insert(handoffs).values({
    sessionId: opts.session.id,
    caseId: opts.caseRow?.id ?? null,
    channel: opts.session.channel === 'phone' ? 'phone' : 'web',
    reason: opts.reason ? redact(opts.reason) : null,
    urgency: opts.urgency ?? 'normal',
    language: opts.caseRow?.language ?? null,
    aiSummary: quickSummary(opts.caseRow, opts.reason),
  }).returning();

  if (opts.caseRow && opts.caseRow.status !== 'draft') {
    await addEvent(opts.caseRow.id, 'handoff_requested', 'citizen', { reason: opts.reason ?? null, channel: row.channel });
  }
  PhoneRunner.for(opts.session.id)?.setHandoff(row.id);
  void broadcast(OPS_TOPIC, 'handoff_requested', await summarize(row));
  void broadcast(`session:${opts.session.id}`, 'handoff', { id: row.id, status: 'queued' });

  // richer brief in the background (never on the tool's latency path)
  setImmediate(() => { void writeBrief(row.id, opts.caseRow, opts.reason); });
  return { handoff: row, already: false };
}

async function writeBrief(handoffId: string, c: CaseRow | null, reason?: string): Promise<void> {
  try {
    const slots = redactDeep(((c?.slots ?? {}) as Record<string, unknown>));
    delete (slots as Record<string, unknown>).__signal;
    const out = await chatJson<{ brief: string }>(
      'You write a 2–3 sentence handover brief for a human operator taking over a cybercrime-complaint call from an AI agent. ' +
      'Cover: what happened, what is already captured (category, amount, identity status, case registered or not), what the caller wants, and tone. ' +
      'Plain English, no bullet points, no personal data beyond a first name. Return JSON {"brief": "..."}.',
      JSON.stringify({
        category: c?.category, status: c?.status, amount_lost: c?.amountLost, identity_verified: !!c?.aadhaarLast4,
        anonymous: c?.anonymous, language: c?.language, reason, slots,
      }),
    );
    if (out?.brief) {
      const [row] = await db.update(handoffs).set({ aiSummary: out.brief }).where(eq(handoffs.id, handoffId)).returning();
      void broadcast(OPS_TOPIC, 'handoff_updated', await summarize(row));
    }
  } catch (err) { console.warn('[handoff] brief failed:', (err as Error).message); }
}

export async function acceptHandoff(id: string, name: string): Promise<HandoffRow> {
  const [row] = await db.update(handoffs).set({ status: 'accepted', assignedTo: name, acceptedAt: new Date() })
    .where(eq(handoffs.id, id)).returning();
  if (!row) throw new Error('handoff not found');
  const [sys] = await db.insert(handoffMessages).values({ handoffId: id, sender: 'system', text: `${name} joined from the desk` }).returning();
  void broadcast(`handoff:${id}`, 'accepted', { name, message: { id: sys.id, sender: 'system', text: sys.text, at: sys.createdAt } });
  if (row.sessionId) {
    void broadcast(`session:${row.sessionId}`, 'handoff', { id, status: 'accepted', name });
    PhoneRunner.for(row.sessionId)?.announceHuman(name);
  }
  if (row.caseId) await addEvent(row.caseId, 'handoff_accepted', 'ops', { name });
  void broadcast(OPS_TOPIC, 'handoff_updated', await summarize(row));
  return row;
}

export async function postHumanMessage(id: string, text: string): Promise<void> {
  const [row] = await db.select().from(handoffs).where(eq(handoffs.id, id));
  if (!row || row.status !== 'accepted') throw new Error('handoff not active');
  const [m] = await db.insert(handoffMessages).values({ handoffId: id, sender: 'human', text: redact(text) }).returning();
  void broadcast(`handoff:${id}`, 'message', { id: m.id, sender: 'human', name: row.assignedTo, text: m.text, at: m.createdAt });
  if (row.sessionId) PhoneRunner.for(row.sessionId)?.relayHuman(text, row.assignedTo ?? 'the desk');
}

export async function postCitizenMessage(id: string, sessionId: string, text: string): Promise<void> {
  const [row] = await db.select().from(handoffs).where(and(eq(handoffs.id, id), eq(handoffs.sessionId, sessionId)));
  if (!row || row.status === 'closed') throw new Error('handoff not active');
  const [m] = await db.insert(handoffMessages).values({ handoffId: id, sender: 'citizen', text: redact(text) }).returning();
  void broadcast(`handoff:${id}`, 'message', { id: m.id, sender: 'citizen', text: m.text, at: m.createdAt });
}

export async function closeHandoff(id: string, by: 'ops' | 'citizen' = 'ops'): Promise<void> {
  const [row] = await db.update(handoffs).set({ status: 'closed', closedAt: new Date() }).where(eq(handoffs.id, id)).returning();
  if (!row) return;
  const [sys] = await db.insert(handoffMessages).values({ handoffId: id, sender: 'system', text: `Conversation closed by ${by === 'ops' ? (row.assignedTo ?? 'the desk') : 'the citizen'}` }).returning();
  void broadcast(`handoff:${id}`, 'closed', { message: { id: sys.id, sender: 'system', text: sys.text, at: sys.createdAt } });
  if (row.sessionId) {
    void broadcast(`session:${row.sessionId}`, 'handoff', { id, status: 'closed' });
    const runner = PhoneRunner.for(row.sessionId);
    if (runner) { runner.humanLeft(); runner.setHandoff(null); }
  }
  if (row.caseId) await addEvent(row.caseId, 'handoff_closed', by === 'ops' ? 'ops' : 'citizen', {});
  void broadcast(OPS_TOPIC, 'handoff_updated', await summarize(row));
}

export interface HandoffSummary {
  id: string; status: string; channel: string; reason: string | null; urgency: string | null;
  ai_summary: string | null; language: string | null; assigned_to: string | null;
  created_at: Date; accepted_at: Date | null;
  case_number: string | null; case_id: string | null; category: string | null; reporter: string | null;
  phone_masked: string | null;
}

export async function summarize(row: HandoffRow): Promise<HandoffSummary> {
  const [c] = row.caseId ? await db.select().from(cases).where(eq(cases.id, row.caseId)) : [];
  const [s] = row.sessionId ? await db.select().from(voiceSessions).where(eq(voiceSessions.id, row.sessionId)) : [];
  return {
    id: row.id, status: row.status, channel: row.channel, reason: row.reason, urgency: row.urgency,
    ai_summary: row.aiSummary, language: row.language, assigned_to: row.assignedTo,
    created_at: row.createdAt, accepted_at: row.acceptedAt,
    case_number: c && c.status !== 'draft' ? c.caseNumber : null, case_id: c?.id ?? null,
    category: c ? categoryLabel(c.category).en : null,
    reporter: c?.anonymous ? 'Anonymous' : (c?.reporterName ?? null),
    phone_masked: s?.phoneMasked ?? c?.phoneMasked ?? null,
  };
}

export async function listHandoffs(statuses: string[] = ['queued', 'accepted']): Promise<HandoffSummary[]> {
  const rows = await db.select().from(handoffs).where(inArray(handoffs.status, statuses)).orderBy(asc(handoffs.createdAt)).limit(50);
  return Promise.all(rows.map(summarize));
}

export async function getHandoff(id: string): Promise<{ handoff: HandoffSummary; messages: { id: string; sender: string; text: string; at: Date }[] } | null> {
  const [row] = await db.select().from(handoffs).where(eq(handoffs.id, id));
  if (!row) return null;
  const msgs = await db.select().from(handoffMessages).where(eq(handoffMessages.handoffId, id)).orderBy(asc(handoffMessages.createdAt)).limit(200);
  return { handoff: await summarize(row), messages: msgs.map((m) => ({ id: m.id, sender: m.sender, text: m.text, at: m.createdAt })) };
}
