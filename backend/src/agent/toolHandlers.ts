import { desc, eq, and, isNotNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cases, otpChallenges, voiceSessions, artifacts, caseEvents, type CaseRow, type VoiceSessionRow } from '../db/schema.js';
import { config } from '../config.js';
import { sha256, isCaseNumber } from '../lib/ids.js';
import { maskPhone, aadhaarLast4, normalizeSuspectValue } from '../lib/normalize.js';
import { broadcast } from '../lib/supabase.js';
import { addEvent } from '../engine/events.js';
import { getPlaybook, CATEGORY_KEYS } from '../engine/playbooks.js';
import { validateSlotPatch, missingSlots } from '../engine/slotSchemas.js';
import { registerCase, sessionIdentityVerified, RegistrationError } from '../engine/register.js';
import { setStatus, isActive } from '../engine/transitions.js';
import { evaluateClocks, nextClock, virtualDay } from '../engine/clocks.js';
import { countSuspectMatches, recordSuspect } from '../engine/handlers.js';
import { categoryLabel, statusLabel } from '../engine/labels.js';
import { getGuidanceList, getGuidance, ezeroDynamicLine } from '../engine/guidance/index.js';
import { humanizeEvent, timelineTimestamp } from '../engine/events.js';
import { ARTIFACT_LABELS } from '../pdf/render.js';
import { formatCaseNumber } from '../lib/ids.js';
import { signCaseToken } from '../lib/jwt.js';

export class ToolError extends Error {
  constructor(public code: string, message: string, public status = 422) { super(message); }
}

/** status-flow lookup target per session (single-process memory; §18.3 lookup→otp→status chain) */
const statusLookupTarget = new Map<string, string>();

export interface ToolContext {
  session: VoiceSessionRow;
}

async function getDraftCase(session: VoiceSessionRow): Promise<CaseRow | null> {
  if (!session.caseId) return null;
  const [c] = await db.select().from(cases).where(eq(cases.id, session.caseId));
  return c ?? null;
}

/** Create-on-first-write: the session's single draft case (§18.3 handler contract). */
async function ensureDraftCase(session: VoiceSessionRow): Promise<CaseRow> {
  const existing = await getDraftCase(session);
  if (existing) return existing;
  const [c] = await db.insert(cases).values({
    caseNumber: `draft-${session.id}`,
    track: 'other', category: 'unclassified', status: 'draft',
  }).returning();
  await db.update(voiceSessions).set({ caseId: c.id }).where(eq(voiceSessions.id, session.id));
  session.caseId = c.id;
  return c;
}

function sessionTopic(session: VoiceSessionRow): string {
  return `session:${session.id}`;
}

async function broadcastSlots(session: VoiceSessionRow, c: CaseRow, extra: Record<string, unknown> = {}): Promise<void> {
  const pb = getPlaybook(c.category);
  await broadcast(sessionTopic(session), 'slots_updated', {
    category: c.category,
    category_label: categoryLabel(c.category),
    track: c.track,
    anonymous: c.anonymous,
    on_behalf_of: c.onBehalfOf,
    slots: c.slots,
    aadhaar_last4: c.aadhaarLast4,
    email: c.email,
    reporter_name: c.reporterName,
    victim_name: c.victimName,
    missing: pb ? missingSlots(pb.slots, (c.slots ?? {}) as Record<string, unknown>) : [],
    required: pb?.slots ?? [],
    ...extra,
  });
}

type ToolResult = Record<string, unknown>;

export async function handleTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  switch (name) {
    case 'classify_category': return classifyCategory(args, ctx);
    case 'set_slots': return setSlots(args, ctx);
    case 'send_aadhaar_otp': return sendAadhaarOtp(args, ctx);
    case 'verify_otp': return verifyOtp(args, ctx);
    case 'capture_contact': return captureContact(args, ctx);
    case 'register_case': return doRegister(ctx);
    case 'lookup_case': return lookupCase(args, ctx);
    case 'send_status_otp': return sendStatusOtp(ctx);
    case 'get_status': return getStatus(ctx);
    case 'withdraw_case': return withdrawCase(args, ctx);
    case 'check_suspect': return checkSuspect(args, ctx);
    case 'get_guidance': return guidance(args, ctx);
    default:
      throw new ToolError('unknown_tool', `No such tool: ${name}`, 404);
  }
}

async function classifyCategory(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const category = String(args.category ?? '');
  const pb = getPlaybook(category);
  if (!pb) throw new ToolError('bad_category', `Unknown category. Valid: ${CATEGORY_KEYS.join(', ')}`);
  let c = await ensureDraftCase(ctx.session);
  if (c.status !== 'draft') throw new ToolError('already_registered', 'The case is already registered; category can no longer change.', 409);

  const anonymous = args.anonymous === true && !!pb.anonymousAllowed;
  const [updated] = await db.update(cases).set({
    category, track: pb.track,
    anonymous,
    onBehalfOf: args.on_behalf_of === true,
    updatedAt: new Date(),
  }).where(eq(cases.id, c.id)).returning();
  c = updated;
  if (anonymous) await addEvent(c.id, 'identity_skipped_anonymous', 'agent', {});
  await broadcastSlots(ctx.session, c);

  const slots = (c.slots ?? {}) as Record<string, unknown>;
  return {
    ok: true, category, track: pb.track,
    category_label: categoryLabel(category),
    sensitive: !!pb.sensitive,
    anonymous_allowed: !!pb.anonymousAllowed,
    anonymous_set: anonymous,
    required_slots: pb.slots,
    missing: missingSlots(pb.slots, slots),
  };
}

async function setSlots(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const patch = (args.patch ?? {}) as Record<string, unknown>;
  if (typeof patch !== 'object' || Array.isArray(patch)) throw new ToolError('bad_patch', 'patch must be an object');
  let c = await ensureDraftCase(ctx.session);
  if (c.status !== 'draft') throw new ToolError('already_registered', 'The case is already registered; use the status flow.', 409);

  const { saved, rejected } = validateSlotPatch(patch);
  const merged = { ...((c.slots ?? {}) as Record<string, unknown>), ...saved };

  // normalized top-level mirrors (§15)
  const top: Partial<typeof cases.$inferInsert> = { slots: merged, updatedAt: new Date() };
  if (typeof saved.amount === 'number') top.amountLost = String(saved.amount);
  if (typeof saved.incident_at === 'string') {
    const parsed = new Date(saved.incident_at);
    if (!Number.isNaN(parsed.getTime())) top.incidentAt = parsed;
  }
  // language: explicit patch wins; else infer Devanagari narrative → 'hi'
  if (typeof patch.language === 'string') top.language = String(patch.language);
  else if (!c.language && typeof saved.narrative === 'string' && /[ऀ-ॿ]/.test(saved.narrative)) top.language = 'hi';
  const [updated] = await db.update(cases).set(top).where(eq(cases.id, c.id)).returning();
  c = updated;
  await broadcastSlots(ctx.session, c, { flash: Object.keys(saved) });

  const pb = getPlaybook(c.category);
  return {
    saved: Object.keys(saved),
    ...(Object.keys(rejected).length > 0 ? { rejected } : {}),
    missing: pb ? missingSlots(pb.slots, merged) : [],
  };
}

async function sendAadhaarOtp(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const last4 = aadhaarLast4(String(args.aadhaar_last4 ?? ''));
  if (!last4) throw new ToolError('bad_aadhaar', 'aadhaar_last4 must be 4 digits');
  let c = await ensureDraftCase(ctx.session);
  if (c.anonymous) throw new ToolError('anonymous_case', 'This is an anonymous filing — identity must not be collected.', 409);

  const [updated] = await db.update(cases).set({ aadhaarLast4: last4, updatedAt: new Date() })
    .where(eq(cases.id, c.id)).returning();
  c = updated;
  await db.insert(otpChallenges).values({
    purpose: 'aadhaar_verify', caseId: c.id, sessionId: ctx.session.id,
    codeHash: sha256(config.otpFixedCode + config.jwtSecret),
    expiresAt: new Date(Date.now() + 5 * 60_000),
  });
  const toast = {
    kind: 'aadhaar_otp',
    text: `${config.otpFixedCode} is your Aadhaar OTP for Jansah.AI. साझा न करें.`,
  };
  await broadcast(sessionTopic(ctx.session), 'sms', toast);
  await broadcastSlots(ctx.session, c);
  return { sent: true, toast, note: 'The OTP has arrived as an SMS on the caller\'s screen — ask them to read the 6-digit code.' };
}

async function latestChallenge(sessionId: string): Promise<typeof otpChallenges.$inferSelect | null> {
  const [row] = await db.select().from(otpChallenges)
    .where(eq(otpChallenges.sessionId, sessionId))
    .orderBy(desc(otpChallenges.createdAt)).limit(1);
  return row ?? null;
}

async function verifyOtp(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const code = String(args.code ?? '');
  if (!/^[0-9]{6}$/.test(code)) throw new ToolError('bad_code', 'code must be 6 digits');
  const ch = await latestChallenge(ctx.session.id);
  if (!ch) throw new ToolError('no_challenge', 'No OTP was sent in this session.');
  if (ch.consumedAt) return { verified: true, purpose: ch.purpose, note: 'Already verified.' };
  if (ch.expiresAt < new Date()) throw new ToolError('expired', 'The OTP expired — send a fresh one.');
  if (ch.attempts >= 3) throw new ToolError('locked', 'Too many wrong attempts — locked for 15 minutes.');

  // Aadhaar verification is fully simulated — in demo mode ANY 6-digit code verifies,
  // so the flow never stalls on hearing the code wrong. Status lookup keeps the real check.
  const ok = sha256(code + config.jwtSecret) === ch.codeHash
    || (config.demoMode && ch.purpose === 'aadhaar_verify');
  await db.update(otpChallenges).set({
    attempts: ch.attempts + 1,
    ...(ok ? { consumedAt: new Date() } : {}),
  }).where(eq(otpChallenges.id, ch.id));

  if (!ok) return { verified: false, attempts_left: Math.max(0, 2 - ch.attempts) };

  if (ch.purpose === 'aadhaar_verify' && ch.caseId) {
    const [c] = await db.select().from(cases).where(eq(cases.id, ch.caseId));
    if (c) {
      await addEvent(c.id, 'identity_verified', 'agent', { aadhaar_last4: c.aadhaarLast4 });
      await broadcastSlots(ctx.session, c, { identity_verified: true });
    }
  }
  return { verified: true, purpose: ch.purpose };
}

async function captureContact(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  let c = await ensureDraftCase(ctx.session);
  const patch: Partial<typeof cases.$inferInsert> = { updatedAt: new Date() };
  const saved: string[] = [];

  if (typeof args.email === 'string' && /.+@.+\..+/.test(args.email)) {
    patch.email = args.email.trim().toLowerCase(); saved.push('email');
  }
  if (!c.anonymous) {
    if (typeof args.phone === 'string') {
      const masked = maskPhone(args.phone);
      if (masked) { patch.phoneMasked = masked; saved.push('phone'); }
    }
    if (typeof args.reporter_name === 'string' && args.reporter_name.trim()) {
      patch.reporterName = args.reporter_name.trim(); saved.push('reporter_name');
    }
    if (typeof args.victim_name === 'string' && args.victim_name.trim()) {
      patch.victimName = args.victim_name.trim(); saved.push('victim_name');
    }
  }
  if (!patch.victimName && patch.reporterName && !c.onBehalfOf) patch.victimName = patch.reporterName;

  const [updated] = await db.update(cases).set(patch).where(eq(cases.id, c.id)).returning();
  c = updated;
  if (saved.length > 0) await addEvent(c.id, 'contact_captured', 'agent', { email: c.email ?? undefined });
  await broadcastSlots(ctx.session, c);
  return {
    saved,
    ...(c.anonymous ? { note: 'Anonymous filing — names/phone are not collected by design; only an optional email may be stored.' } : {}),
  };
}

async function doRegister(ctx: ToolContext): Promise<ToolResult> {
  const c = await getDraftCase(ctx.session);
  if (!c) throw new ToolError('no_case', 'Nothing to register yet — classify and collect details first.');
  const identityVerified = await sessionIdentityVerified(ctx.session.id);
  try {
    const { caseNumber, already } = await registerCase(c, { identityVerified });
    return {
      registered: true, already,
      case_number: caseNumber,
      case_number_spaced: formatCaseNumber(caseNumber),
      // identity was verified in this session → short-lived case token for the ended-card downloads
      case_token: signCaseToken(c.id),
      toast: {
        kind: 'registration',
        text: `Your cybercrime complaint is registered. Acknowledgment no: ${caseNumber}. Track anytime with this number. — Jansah.AI`,
      },
      note: 'Read the case number digit by digit, twice. The complaint PDF is being generated and will appear on screen' +
        (c.email ? ' and in their inbox.' : '.'),
    };
  } catch (err) {
    if (err instanceof RegistrationError) throw new ToolError(err.code, err.message);
    throw err;
  }
}

async function lookupCase(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const caseNumber = String(args.case_number ?? '');
  if (!isCaseNumber(caseNumber)) throw new ToolError('bad_case_number', 'case_number must be 14 digits');
  const [c] = await db.select().from(cases).where(eq(cases.caseNumber, caseNumber));
  if (!c) return { exists: false };
  statusLookupTarget.set(ctx.session.id, c.id);
  // §18.3: only existence + masked phone pre-OTP
  return { exists: true, phone_masked: c.phoneMasked ?? null };
}

async function sendStatusOtp(ctx: ToolContext): Promise<ToolResult> {
  const caseId = statusLookupTarget.get(ctx.session.id);
  if (!caseId) throw new ToolError('no_lookup', 'Call lookup_case first.');
  await db.insert(otpChallenges).values({
    purpose: 'status_lookup', caseId, sessionId: ctx.session.id,
    codeHash: sha256(config.otpFixedCode + config.jwtSecret),
    expiresAt: new Date(Date.now() + 5 * 60_000),
  });
  const toast = { kind: 'status_otp', text: `${config.otpFixedCode} is your Jansah.AI status OTP. साझा न करें.` };
  await broadcast(sessionTopic(ctx.session), 'sms', toast);
  return { sent: true, toast, note: 'The status OTP has arrived as an SMS on the caller\'s screen — ask them to read it.' };
}

/** get_status/withdraw require a CONSUMED status_lookup challenge bound to this session (§18.3). */
async function verifiedStatusCase(ctx: ToolContext): Promise<CaseRow> {
  const [ch] = await db.select().from(otpChallenges)
    .where(and(
      eq(otpChallenges.sessionId, ctx.session.id),
      eq(otpChallenges.purpose, 'status_lookup'),
      isNotNull(otpChallenges.consumedAt),
    ))
    .orderBy(desc(otpChallenges.createdAt)).limit(1);
  if (!ch || !ch.caseId) throw new ToolError('unverified', 'Status OTP has not been verified in this session.', 401);
  const [c] = await db.select().from(cases).where(eq(cases.id, ch.caseId));
  if (!c) throw new ToolError('not_found', 'Case not found.', 404);
  return c;
}

async function getStatus(ctx: ToolContext): Promise<ToolResult> {
  let c = await verifiedStatusCase(ctx);
  await evaluateClocks(c.id);   // lazy guarantee (§20)
  const [fresh] = await db.select().from(cases).where(eq(cases.id, c.id));
  c = fresh ?? c;

  const evs = await db.select().from(caseEvents)
    .where(eq(caseEvents.caseId, c.id)).orderBy(desc(caseEvents.createdAt)).limit(10);
  const isHindi = (c.language ?? '').startsWith('hi');
  const timeline = evs.map((e) => {
    const line = humanizeEvent(e);
    return `${timelineTimestamp(line)} — ${isHindi ? line.hi : line.en}`;
  });
  const nc = await nextClock(c);
  const arts = await db.select().from(artifacts).where(eq(artifacts.caseId, c.id));
  const sl = statusLabel(c.status);
  return {
    case_number: c.caseNumber,
    status: c.status,
    status_label: `${sl.en} / ${sl.hi}`,
    substatus: c.substatus,
    virtual_day: virtualDay(c),
    timeline,
    next_clock: nc ? {
      label: isHindi ? nc.label_hi : nc.label_en,
      in_days_virtual: nc.in_days_virtual,
    } : null,
    artifacts: arts.map((a) => ({
      kind: a.kind,
      label: ARTIFACT_LABELS[a.kind as keyof typeof ARTIFACT_LABELS]?.en ?? a.kind,
    })),
  };
}

async function withdrawCase(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  if (args.confirm !== true) throw new ToolError('not_confirmed', 'Set confirm=true only after the caller confirms twice.');
  const c = await verifiedStatusCase(ctx);
  if (!isActive(c.status)) throw new ToolError('not_active', `Case is ${c.status}; it cannot be withdrawn.`, 409);
  await setStatus(c, 'withdrawn', 'agent');
  await addEvent(c.id, 'withdrawn', 'citizen', {});
  return { withdrawn: true, case_number: c.caseNumber };
}

async function checkSuspect(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const kind = String(args.kind ?? '');
  if (!['phone', 'upi', 'bank_account', 'url', 'email', 'handle'].includes(kind)) {
    throw new ToolError('bad_kind', 'kind must be one of phone|upi|bank_account|url|email|handle');
  }
  const value = normalizeSuspectValue(kind, String(args.value ?? ''));
  if (value.length < 3) throw new ToolError('bad_value', 'value too short');
  const c = await ensureDraftCase(ctx.session);
  const matches = await countSuspectMatches(kind, value, c.id);
  await recordSuspect(c.id, kind, value);
  if (matches > 0 && c.status === 'draft') {
    await addEvent(c.id, 'suspect_match', 'agent', { kind, value, matches });
  }
  await broadcast(sessionTopic(ctx.session), 'suspect_checked', { kind, value, matches });
  return {
    matches,
    note: matches > 0
      ? `This identifier appears in ${matches} prior report(s) in our (simulated) repository — tell the caller they are not alone and this strengthens the complaint.`
      : 'No prior reports of this identifier in our (simulated) repository.',
  };
}

async function guidance(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const category = String(args.category ?? '');
  const pb = getPlaybook(category);
  const c = await getDraftCase(ctx.session);
  const isHindi = (c?.language ?? '').startsWith('hi');
  if (!pb) throw new ToolError('bad_category', 'Unknown category');

  const topic = typeof args.topic === 'string' ? args.topic : null;
  const keys = topic ? pb.guidance.filter((k) => k === topic) : pb.guidance;
  const list = (topic && keys.length === 0 && getGuidance(topic)) ? [getGuidance(topic)!] : getGuidanceList(keys);

  const items = list.map((g) => {
    let body = isHindi ? g.hi.body : g.en.body;
    if (g.key === 'ezero_fir') {
      const dyn = ezeroDynamicLine(c?.amountLost !== null && c?.amountLost !== undefined ? Number(c.amountLost) : null);
      body = `${body} ${isHindi ? dyn.hi : dyn.en}`;
    }
    return { key: g.key, title: isHindi ? g.hi.title : g.en.title, body };
  });
  return { language: isHindi ? 'hi' : 'en', items, note: 'Read these verbatim; do not embellish.' };
}
