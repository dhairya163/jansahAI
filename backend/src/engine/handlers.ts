import { and, eq, isNull, ne, or, sql as dsql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cases, suspects, type CaseRow } from '../db/schema.js';
import { addEvent, type Actor } from './events.js';
import { setStatus } from './transitions.js';
import { generateArtifact } from '../pdf/render.js';
import { sendCaseEmail } from '../email/send.js';
import { normalizeSuspectValue } from '../lib/normalize.js';
import type { Handler } from './playbooks.js';

/** §17 handlers — one small function each; idempotent; failures logged, never thrown upward (§17.3). */

export interface HandlerCtx {
  actor: Actor;
  clockKey?: string;    // set when running as clock actions (drives escalation email level)
}

async function freshCase(id: string): Promise<CaseRow> {
  const [c] = await db.select().from(cases).where(eq(cases.id, id));
  if (!c) throw new Error(`case ${id} vanished`);
  return c;
}

export async function runHandlers(caseId: string, handlers: Handler[], ctx: HandlerCtx): Promise<void> {
  for (const h of handlers) {
    try {
      const c = await freshCase(caseId);
      await runHandler(c, h, ctx);
    } catch (err) {
      console.warn(`[handler:${h.do}] failed for case ${caseId}:`, (err as Error).message);
      try {
        await addEvent(caseId, 'immediate_failed', 'system', { step: h.do, error: (err as Error).message });
      } catch { /* never abort the chain */ }
    }
  }
}

async function runHandler(c: CaseRow, h: Handler, ctx: HandlerCtx): Promise<void> {
  switch (h.do) {
    case 'artifact':
      await generateArtifact(c, h.kind);
      return;

    case 'email': {
      const level = ctx.clockKey === 'magistrate' ? 'Magistrate' : 'SP';
      await sendCaseEmail(c, h.template, { escalationLevel: level });
      return;
    }

    case 'mock_freeze_request': {
      await addEvent(c.id, 'freeze_requested', 'system', {});
      await db.update(cases).set({ substatus: 'freeze requested — awaiting confirmation', updatedAt: new Date() })
        .where(eq(cases.id, c.id));
      return;
    }

    case 'suspect_lookup':
      await suspectLookup(c);
      return;

    case 'ezero_fir_check': {
      const amount = c.amountLost !== null ? Number(c.amountLost) : null;
      if (amount !== null && amount >= 1_000_000) {
        await addEvent(c.id, 'ezero_fir_notice', 'system', { amount });
      }
      return;
    }

    case 'offer':
      await addEvent(c.id, 'offer', 'system', { key: h.key });
      return;

    case 'status':
      await setStatus(c, h.to, ctx.actor === 'ops' ? 'ops' : 'system');
      return;
  }
}

/** Extract suspect identifiers from slots. */
export function suspectSlotsOf(c: CaseRow): { kind: string; value: string }[] {
  const slots = (c.slots ?? {}) as Record<string, unknown>;
  const out: { kind: string; value: string }[] = [];
  const push = (kind: string, value: unknown) => {
    if (typeof value === 'string' && value.trim().length >= 3) out.push({ kind, value: normalizeSuspectValue(kind, value) });
  };
  if (typeof slots.payee_identifier === 'string') {
    const inst = String(slots.instrument ?? '');
    push(inst === 'upi' ? 'upi' : inst === 'crypto' ? 'handle' : 'bank_account', slots.payee_identifier);
  }
  for (const u of (Array.isArray(slots.urls) ? slots.urls as unknown[] : [])) push('url', u);
  for (const n of (Array.isArray(slots.numbers) ? slots.numbers as unknown[] : [])) push('phone', n);
  for (const hh of (Array.isArray(slots.suspect_handles) ? slots.suspect_handles as unknown[] : [])) push('handle', hh);
  for (const sc of (Array.isArray(slots.suspect_contacts) ? slots.suspect_contacts as { kind?: string; value?: string }[] : [])) {
    if (sc?.kind && sc?.value) push(sc.kind, sc.value);
  }
  // de-dupe
  const seen = new Set<string>();
  return out.filter((s) => {
    const k = `${s.kind}:${s.value}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function suspectLookup(c: CaseRow): Promise<void> {
  for (const s of suspectSlotsOf(c)) {
    const matches = await countSuspectMatches(s.kind, s.value, c.id);
    await recordSuspect(c.id, s.kind, s.value);
    if (matches > 0) {
      await addEvent(c.id, 'suspect_match', 'system', { kind: s.kind, value: s.value, matches });
    }
  }
}

/** Matches in the (seeded) repository, excluding this case's own rows. */
export async function countSuspectMatches(kind: string, valueNorm: string, excludeCaseId?: string | null): Promise<number> {
  const [row] = await db.select({ n: dsql<number>`count(*)::int` }).from(suspects)
    .where(and(
      eq(suspects.kind, kind),
      eq(suspects.valueNorm, valueNorm),
      excludeCaseId ? or(isNull(suspects.caseId), ne(suspects.caseId, excludeCaseId)) : undefined,
    ));
  return row?.n ?? 0;
}

/** Idempotent per (case, kind, value). */
export async function recordSuspect(caseId: string, kind: string, valueNorm: string): Promise<void> {
  const existing = await db.select({ id: suspects.id }).from(suspects)
    .where(and(eq(suspects.caseId, caseId), eq(suspects.kind, kind), eq(suspects.valueNorm, valueNorm)));
  if (existing.length === 0) {
    await db.insert(suspects).values({ caseId, kind, valueNorm });
  }
}
