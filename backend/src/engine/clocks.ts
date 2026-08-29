import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cases, caseEvents, clocks, type CaseRow, type ClockRow } from '../db/schema.js';
import { addDays, virtualNow, daysBetween, fmtDateIST } from '../lib/virtualTime.js';
import { addEvent } from './events.js';
import { runHandlers } from './handlers.js';
import type { ClockCondition, Handler } from './playbooks.js';

/** §20 — lazy, pure-decision, idempotent clock evaluation. */

const TERMINAL_FOR_NO_FIR = new Set(['fir_registered', 'resolved', 'closed', 'withdrawn']);

export async function conditionHolds(c: CaseRow, condition: ClockCondition): Promise<boolean> {
  switch (condition) {
    case 'always': return true;
    case 'no_fir': return !TERMINAL_FOR_NO_FIR.has(c.status);
    case 'no_freeze_confirmation': return !(await hasEvent(c.id, 'freeze_confirmed'));
    case 'no_platform_ack': return !(await hasEvent(c.id, 'platform_ack'));
    case 'content_not_removed': return !(await hasEvent(c.id, 'content_removed'));
    default: return false;
  }
}

async function hasEvent(caseId: string, type: string): Promise<boolean> {
  const rows = await db.select({ id: caseEvents.id }).from(caseEvents)
    .where(and(eq(caseEvents.caseId, caseId), eq(caseEvents.type, type)))
    .limit(1);
  return rows.length > 0;
}

/**
 * Evaluate all pending clocks for a case against its virtual now.
 * Fires in due-day order; each firing writes clock_fired (the honesty trail).
 * Returns keys fired this pass.
 */
export async function evaluateClocks(caseId: string): Promise<string[]> {
  const [c] = await db.select().from(cases).where(eq(cases.id, caseId));
  if (!c || !c.registeredAt) return [];
  if (['withdrawn', 'closed', 'draft'].includes(c.status)) return [];

  const pending = await db.select().from(clocks)
    .where(eq(clocks.caseId, caseId))
    .orderBy(asc(clocks.dueDays));

  const fired: string[] = [];
  for (const clk of pending) {
    if (clk.status !== 'pending') continue;
    const [current] = await db.select().from(cases).where(eq(cases.id, caseId));
    if (!current) break;
    const vNow = virtualNow(current.timeOffsetDays);
    const due = addDays(current.registeredAt ?? current.createdAt, clk.dueDays);
    if (vNow < due) continue;

    if (await conditionHolds(current, clk.condition as ClockCondition)) {
      await db.update(clocks).set({ status: 'fired', firedAt: new Date() }).where(eq(clocks.id, clk.id));
      await addEvent(caseId, 'clock_fired', 'system', {
        step_key: clk.stepKey, due_days: clk.dueDays,
        real_at: new Date().toISOString(), virtual_at: vNow.toISOString(),
      });
      await runHandlers(caseId, clk.action as Handler[], { actor: 'system', clockKey: clk.stepKey });
      fired.push(clk.stepKey);
    } else {
      await db.update(clocks).set({ status: 'skipped' }).where(eq(clocks.id, clk.id));
      await addEvent(caseId, 'clock_skipped', 'system', { step_key: clk.stepKey, due_days: clk.dueDays });
    }
  }
  return fired;
}

export interface NextClockInfo {
  step_key: string;
  due_days: number;
  in_days_virtual: number;
  due_date: string;
  label_en: string;
  label_hi: string;
}

const CLOCK_LABELS: Record<string, { en: string; hi: string }> = {
  bank_followup: { en: 'Bank follow-up — RBI Ombudsman guidance if unresolved', hi: 'बैंक फ़ॉलो-अप' },
  fir_check: { en: 'FIR check — police application pack prepares if no FIR', hi: 'FIR जाँच — FIR न होने पर पुलिस आवेदन तैयार होगा' },
  sp_escalation: { en: 'SP escalation letter', hi: 'SP को पत्र' },
  magistrate: { en: 'Magistrate application draft', hi: 'मजिस्ट्रेट आवेदन मसौदा' },
  status_rti: { en: 'Status-RTI becomes available', hi: 'स्थिति-RTI उपलब्ध होगी' },
  platform_ack: { en: 'Platform acknowledgment check (24h rule)', hi: 'प्लेटफ़ॉर्म पावती जाँच (24 घंटे)' },
  gac: { en: 'GAC appeal note if content not removed', hi: 'GAC अपील नोट' },
};

/** The soonest pending clock, in virtual days from now (§12.3 "Next step" callout). */
export async function nextClock(c: CaseRow): Promise<NextClockInfo | null> {
  if (!c.registeredAt) return null;
  const pending = await db.select().from(clocks)
    .where(eq(clocks.caseId, c.id)).orderBy(asc(clocks.dueDays));
  const vNow = virtualNow(c.timeOffsetDays);
  for (const clk of pending) {
    if (clk.status !== 'pending') continue;
    const due = addDays(c.registeredAt, clk.dueDays);
    const inDays = Math.max(0, Math.ceil((due.getTime() - vNow.getTime()) / 86_400_000));
    const label = CLOCK_LABELS[clk.stepKey] ?? { en: clk.stepKey, hi: clk.stepKey };
    return {
      step_key: clk.stepKey, due_days: clk.dueDays, in_days_virtual: inDays,
      due_date: fmtDateIST(due), label_en: label.en, label_hi: label.hi,
    };
  }
  return null;
}

/** Demo time machine — §20: advance offset then evaluate immediately. */
export async function advanceTime(caseId: string, days: number): Promise<{ offset: number; fired: string[] }> {
  const [c] = await db.select().from(cases).where(eq(cases.id, caseId));
  if (!c) throw new Error('case not found');
  const offset = c.timeOffsetDays + days;
  await db.update(cases).set({ timeOffsetDays: offset, updatedAt: new Date() }).where(eq(cases.id, caseId));
  await addEvent(caseId, 'time_advanced', 'ops', { days, total_offset: offset });
  const fired = await evaluateClocks(caseId);
  return { offset, fired };
}

/** Jump to the next pending clock's due day (+ evaluate). */
export async function jumpToNextClock(caseId: string): Promise<{ offset: number; fired: string[] } | null> {
  const [c] = await db.select().from(cases).where(eq(cases.id, caseId));
  if (!c || !c.registeredAt) return null;
  const nc = await nextClock(c);
  if (!nc) return null;
  const days = Math.max(1, nc.in_days_virtual);
  return advanceTime(caseId, days);
}

export function virtualDay(c: CaseRow): number {
  if (!c.registeredAt) return 0;
  return Math.max(0, daysBetween(c.registeredAt, virtualNow(c.timeOffsetDays)));
}
