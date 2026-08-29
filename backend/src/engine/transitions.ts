import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cases, type CaseRow } from '../db/schema.js';
import { addEvent, type Actor } from './events.js';
import { broadcast } from '../lib/supabase.js';
import type { CaseStatus } from './playbooks.js';

/** §16.2 transition table — only these; everything else throws TransitionError (→409). */

export class TransitionError extends Error {
  status = 409;
  constructor(from: string, to: string) {
    super(`Illegal transition ${from} → ${to}`);
  }
}

const ACTIVE: CaseStatus[] = ['registered', 'under_process', 'stalled', 'escalated_l1', 'escalated_l2', 'fir_registered'];

const ALLOWED: Record<string, CaseStatus[]> = {
  draft: ['registered'],
  registered: ['under_process', 'resolved', 'withdrawn', 'closed'],
  under_process: ['stalled', 'fir_registered', 'resolved', 'withdrawn', 'closed', 'under_process'],
  stalled: ['escalated_l1', 'fir_registered', 'resolved', 'withdrawn', 'closed'],
  escalated_l1: ['escalated_l2', 'fir_registered', 'resolved', 'withdrawn', 'closed'],
  escalated_l2: ['fir_registered', 'resolved', 'withdrawn', 'closed'],
  fir_registered: ['resolved', 'closed'],
  resolved: ['closed'],
  withdrawn: ['closed'],
  closed: [],
};

export function canTransition(from: string, to: CaseStatus): boolean {
  if (from === to) return true; // no-op writes (e.g. substatus updates) are fine
  return (ALLOWED[from] ?? []).includes(to);
}

export function isActive(status: string): boolean {
  return ACTIVE.includes(status as CaseStatus);
}

/**
 * Central guarded status write. Every state change in the system goes through here (AGENTS.md rule).
 * Emits status_changed event + broadcast. Returns the fresh row.
 */
export async function setStatus(
  caseRow: Pick<CaseRow, 'id' | 'status'>,
  to: CaseStatus,
  actor: Actor,
  extra: { substatus?: string | null; eventPayload?: Record<string, unknown> } = {},
): Promise<CaseRow> {
  if (!canTransition(caseRow.status, to)) throw new TransitionError(caseRow.status, to);
  const [updated] = await db.update(cases)
    .set({
      status: to,
      ...(extra.substatus !== undefined ? { substatus: extra.substatus } : {}),
      updatedAt: new Date(),
    })
    .where(eq(cases.id, caseRow.id))
    .returning();
  if (caseRow.status !== to) {
    await addEvent(caseRow.id, 'status_changed', actor, { from: caseRow.status, to, ...(extra.eventPayload ?? {}) });
    void broadcast(`case:${caseRow.id}`, 'status_changed', { from: caseRow.status, to });
  }
  return updated;
}
