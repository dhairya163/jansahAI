import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cases, clocks, otpChallenges, type CaseRow } from '../db/schema.js';
import { generateCaseNumber } from '../lib/ids.js';
import { addEvent } from './events.js';
import { setStatus } from './transitions.js';
import { getPlaybook } from './playbooks.js';
import { missingSlots } from './slotSchemas.js';
import { runHandlers } from './handlers.js';
import { sendCaseEmail } from '../email/send.js';
import { broadcast } from '../lib/supabase.js';
import { and, isNotNull } from 'drizzle-orm';

export class RegistrationError extends Error {
  status = 422;
  constructor(public code: string, message: string) { super(message); }
}

/**
 * §16.2 draft → registered. Guards: category set · required slots valid · identity verified OR
 * anonymous-allowed track. Idempotent — second call returns the same case number.
 * Returns fast; §17.3 immediates + clocks + ack email run in the background.
 */
export async function registerCase(caseRow: CaseRow, opts: { identityVerified: boolean; sync?: boolean }): Promise<{ caseNumber: string; already: boolean }> {
  if (caseRow.status !== 'draft') {
    return { caseNumber: caseRow.caseNumber, already: true };
  }

  const pb = getPlaybook(caseRow.category);
  if (!pb || caseRow.category === 'unclassified') {
    throw new RegistrationError('no_category', 'Category has not been classified yet.');
  }
  const slots = (caseRow.slots ?? {}) as Record<string, unknown>;
  const missing = missingSlots(pb.slots, slots);
  if (missing.length > 0) {
    throw new RegistrationError('missing_slots', `Required details missing: ${missing.join(', ')}`);
  }
  const anonymousOk = caseRow.anonymous && pb.anonymousAllowed;
  if (!anonymousOk && !opts.identityVerified) {
    throw new RegistrationError('identity_unverified', 'Identity must be verified (mock Aadhaar OTP) or the caller must choose anonymous filing on a track that permits it.');
  }

  // issue case number with collision retry (§29)
  let caseNumber = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    caseNumber = generateCaseNumber();
    const clash = await db.select({ id: cases.id }).from(cases).where(eq(cases.caseNumber, caseNumber));
    if (clash.length === 0) break;
    caseNumber = '';
  }
  if (!caseNumber) throw new RegistrationError('case_number', 'Could not issue a unique case number.');

  const registeredAt = new Date();
  await db.update(cases).set({ caseNumber, registeredAt, updatedAt: registeredAt }).where(eq(cases.id, caseRow.id));
  const fresh = { ...caseRow, caseNumber, registeredAt };
  await setStatus(fresh, 'registered', 'agent', {
    eventPayload: { case_number: caseNumber, language: caseRow.language },
  });
  await addEvent(caseRow.id, 'registered', 'agent', { case_number: caseNumber, language: caseRow.language });

  // "SMS" with the 14-digit number (mock plane — phone-frame toast)
  void broadcast(`case:${caseRow.id}`, 'sms', smsPayload(caseNumber));

  // immediates → clocks → ack email (§17.3 registration algorithm; each handler idempotent, failures logged).
  // Runs in the background for voice latency (§18.3); seed/tests pass sync:true to await it.
  const chain = async (): Promise<void> => {
    try {
      await runHandlers(caseRow.id, pb.immediate, { actor: 'agent' });
      for (const clk of pb.clocks) {
        await db.insert(clocks).values({
          caseId: caseRow.id, stepKey: clk.key, dueDays: clk.afterDays,
          condition: clk.condition, action: clk.actions,
        }).onConflictDoNothing();
      }
      const [c2] = await db.select().from(cases).where(eq(cases.id, caseRow.id));
      if (c2) await sendCaseEmail(c2, 'ack');
    } catch (err) {
      console.error(`[register] background chain failed for ${caseRow.id}:`, err);
    }
  };
  if (opts.sync) await chain();
  else setImmediate(() => { void chain(); });

  return { caseNumber, already: false };
}

export function smsPayload(caseNumber: string): { text: string; kind: string } {
  return {
    kind: 'registration',
    text: `Your cybercrime complaint is registered. Acknowledgment no: ${caseNumber}. Track with this number + OTP. — Jansah.AI`,
  };
}

/** Has this session verified identity via the mock Aadhaar OTP? */
export async function sessionIdentityVerified(sessionId: string): Promise<boolean> {
  const rows = await db.select({ id: otpChallenges.id }).from(otpChallenges)
    .where(and(
      eq(otpChallenges.sessionId, sessionId),
      eq(otpChallenges.purpose, 'aadhaar_verify'),
      isNotNull(otpChallenges.consumedAt),
    ));
  return rows.length > 0;
}
