import { createHash } from 'node:crypto';

import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { config } from '../config.js';
import { makeEvent, repository } from '../db/repository.js';
import type { ArtifactKind, ArtifactRecord, CaseBundle, CaseRecord, CaseStatus, ClockRecord, Handler, SuspectRecord } from '../domain/types.js';
import { getGuidance } from '../engine/guidance.js';
import { categoryLabels, playbooks } from '../engine/playbooks.js';
import { normalizeIncidentTimestamp } from '../lib/dateTime.js';
import { caseNumber, id } from '../lib/ids.js';
import { aadhaarLast4, maskPhone, normalizeSuspect, redactSensitive } from '../lib/redact.js';
import { artifactLabels } from './artifacts.js';
import { sendCaseEmail } from './email.js';

export const registrationSchema = z.object({
  category: z.string().refine((value) => Boolean(playbooks[value]), 'Unsupported category'),
  language: z.string().default('en'),
  anonymous: z.boolean().default(false),
  onBehalfOf: z.boolean().default(false),
  reporterName: z.string().trim().max(100).optional(),
  victimName: z.string().trim().max(100).optional(),
  phone: z.string().max(24).optional(),
  email: z.email().optional().or(z.literal('')),
  aadhaar: z.string().max(24).optional(),
  amount: z.coerce.number().nonnegative().optional(),
  incidentAt: z.string().optional().transform((value, context) => {
    if (!value) return undefined;
    const normalized = normalizeIncidentTimestamp(value);
    if (normalized) return normalized;
    context.addIssue({ code: 'custom', message: 'Incident time could not be understood' });
    return z.NEVER;
  }),
  narrative: z.string().trim().min(20).max(8000),
  slots: z.record(z.string(), z.unknown()).default({}),
  demoPersona: z.string().optional(),
});

type RegistrationInput = z.infer<typeof registrationSchema>;
type OtpChallenge = { caseId: string; hash: string; attempts: number; expiresAt: number; verified: boolean };
const otpChallenges = new Map<string, OtpChallenge>();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export const virtualNow = (record: CaseRecord) => new Date(Date.now() + record.timeOffsetDays * 86_400_000);

async function addArtifact(record: CaseRecord, kind: ArtifactKind) {
  const current = await repository.listArtifacts(record.id);
  const existing = current.find((item) => item.kind === kind && item.version === 1);
  if (existing) return existing;
  const artifact: ArtifactRecord = { id: id(), caseId: record.id, kind, label: artifactLabels[kind], version: 1, meta: {}, createdAt: new Date().toISOString() };
  await repository.addArtifact(artifact);
  await repository.addEvent(makeEvent(record.id, 'artifact_generated', 'system', { kind, label: artifact.label, artifact_id: artifact.id }, virtualNow(record).toISOString()));
  return artifact;
}

async function setStatus(record: CaseRecord, to: CaseStatus, actor: 'system' | 'ops' = 'system') {
  const allowed: Record<CaseStatus, CaseStatus[]> = {
    draft: ['registered'], registered: ['under_process'], under_process: ['stalled', 'fir_registered', 'resolved', 'withdrawn', 'closed'],
    stalled: ['escalated_l1', 'fir_registered', 'resolved', 'withdrawn', 'closed'], escalated_l1: ['escalated_l2', 'fir_registered', 'resolved', 'withdrawn', 'closed'],
    escalated_l2: ['fir_registered', 'resolved', 'withdrawn', 'closed'], fir_registered: ['resolved', 'closed'], resolved: ['closed'], withdrawn: ['closed'], closed: [],
  };
  if (record.status === to) return;
  if (!allowed[record.status]?.includes(to)) throw Object.assign(new Error(`Transition ${record.status} → ${to} is not allowed`), { statusCode: 409 });
  const from = record.status; record.status = to; record.updatedAt = new Date().toISOString();
  await repository.saveCase(record);
  await repository.addEvent(makeEvent(record.id, 'status_changed', actor, { from, to, label: to.replaceAll('_', ' ') }, virtualNow(record).toISOString()));
}

async function suspectLookup(record: CaseRecord) {
  const values: Array<{ kind: SuspectRecord['kind']; value: string }> = [];
  const payee = record.slots.payee_identifier;
  if (typeof payee === 'string') values.push({ kind: payee.includes('@') ? 'upi' : 'bank_account', value: payee });
  const contacts = Array.isArray(record.slots.suspect_contacts) ? record.slots.suspect_contacts as Array<{ kind?: string; value?: string }> : [];
  for (const contact of contacts) if (contact.value) values.push({ kind: (contact.kind as SuspectRecord['kind']) ?? 'phone', value: contact.value });
  for (const item of values) {
    const matches = await repository.findSuspects(item.kind, normalizeSuspect(item.value));
    await repository.addSuspect({ id: id(), caseId: record.id, kind: item.kind, valueNorm: normalizeSuspect(item.value) });
    if (matches.length) await repository.addEvent(makeEvent(record.id, 'suspect_match', 'system', { kind: item.kind, value: item.value, prior_reports: matches.length }, virtualNow(record).toISOString()));
  }
}

async function runHandler(record: CaseRecord, handler: Handler, clockKey?: string) {
  if (handler.do === 'artifact') await addArtifact(record, handler.kind);
  if (handler.do === 'email') await sendCaseEmail(record, handler.template);
  if (handler.do === 'status') await setStatus(record, handler.to);
  if (handler.do === 'mock_freeze_request') {
    record.substatus = 'Mock bank-chain hold requested'; await repository.saveCase(record);
    await repository.addEvent(makeEvent(record.id, 'freeze_requested', 'system', { label: 'Mock freeze request sent to ops', simulated: true }, virtualNow(record).toISOString()));
  }
  if (handler.do === 'suspect_lookup') await suspectLookup(record);
  if (handler.do === 'ezero_fir_check' && Number(record.amountLost ?? 0) >= 1_000_000) await repository.addEvent(makeEvent(record.id, 'ezero_fir_notice', 'system', { eligible_threshold: true, simulated: true }, virtualNow(record).toISOString()));
  if (handler.do === 'offer') await repository.addEvent(makeEvent(record.id, 'note', 'system', { guidance_key: handler.key, label: `Guidance unlocked: ${handler.key.replaceAll('_', ' ')}`, clock: clockKey }, virtualNow(record).toISOString()));
}

export async function registerCase(raw: unknown) {
  const input = registrationSchema.parse(raw) as RegistrationInput;
  const playbook = playbooks[input.category];
  if (input.anonymous && !playbook.anonymousAllowed) throw Object.assign(new Error('Anonymous filing is not available for this track'), { statusCode: 422 });
  if (!input.anonymous && !input.reporterName) throw Object.assign(new Error('Reporter name is required unless anonymous filing is allowed'), { statusCode: 422 });

  const now = new Date().toISOString();
  const slots = redactSensitive({ ...input.slots, narrative: input.narrative, amount: input.amount, incident_at: input.incidentAt }) as Record<string, unknown>;
  let number = caseNumber();
  while (await repository.getCaseByNumber(number)) number = caseNumber(new Date(Date.now() + 1000));
  const record: CaseRecord = {
    id: id(), caseNumber: number, track: playbook.track, category: input.category, status: 'registered', language: input.language,
    anonymous: input.anonymous, onBehalfOf: input.onBehalfOf, reporterName: input.anonymous ? undefined : input.reporterName,
    victimName: input.victimName, phoneMasked: maskPhone(input.phone), email: input.email || undefined, aadhaarLast4: aadhaarLast4(input.aadhaar),
    amountLost: input.amount, incidentAt: input.incidentAt, slots, timeOffsetDays: 0, keepForDemo: Boolean(input.demoPersona), createdAt: now, updatedAt: now,
  };
  await repository.saveCase(record);
  await repository.addEvent(makeEvent(record.id, 'registered', 'agent', { label: 'Complaint registered', case_number: record.caseNumber, category: categoryLabels[record.category] }, now));
  await repository.addEvent(makeEvent(record.id, input.anonymous ? 'identity_skipped_anonymous' : 'identity_verified', 'agent', { label: input.anonymous ? 'Anonymous filing selected' : `Identity verified (mock) · Aadhaar ending ${record.aadhaarLast4 ?? '—'}`, simulated: true }, now));

  for (const clock of playbook.clocks) await repository.addClock({ id: id(), caseId: record.id, stepKey: clock.key, dueDays: clock.afterDays, condition: clock.condition, actions: clock.actions, status: 'pending' });
  for (const handler of playbook.immediate) {
    try { await runHandler(record, handler); }
    catch (error) { await repository.addEvent(makeEvent(record.id, 'note', 'system', { label: 'A follow-up action will retry', handler: handler.do, error: error instanceof Error ? error.message : 'Unknown error' }, virtualNow(record).toISOString())); }
  }
  const emailDelivery = await sendCaseEmail(record, 'ack');
  return { bundle: await getCaseBundle(record), accessToken: signCaseToken(record.id), emailDelivery };
}

const conditionHolds = async (record: CaseRecord, condition: ClockRecord['condition']) => {
  const events = await repository.listEvents(record.id);
  if (condition === 'always') return true;
  if (condition === 'no_fir') return !['fir_registered', 'resolved', 'closed', 'withdrawn'].includes(record.status);
  if (condition === 'no_freeze_confirmation') return !events.some((event) => event.type === 'freeze_confirmed');
  if (condition === 'no_platform_ack') return !events.some((event) => event.type === 'note' && event.payload.kind === 'platform_ack');
  if (condition === 'content_not_removed') return !events.some((event) => event.type === 'note' && event.payload.kind === 'content_removed');
  return false;
};

export async function evaluateCase(record: CaseRecord) {
  const clocks = await repository.listClocks(record.id);
  const registeredAt = new Date(record.createdAt).getTime();
  const now = virtualNow(record);
  const fired: string[] = [];
  for (const clock of clocks.filter((item) => item.status === 'pending').sort((a, b) => a.dueDays - b.dueDays)) {
    if (now.getTime() < registeredAt + clock.dueDays * 86_400_000) continue;
    const holds = await conditionHolds(record, clock.condition);
    clock.status = holds ? 'fired' : 'skipped'; clock.firedAt = new Date().toISOString(); await repository.updateClock(clock);
    await repository.addEvent(makeEvent(record.id, holds ? 'clock_fired' : 'clock_skipped', 'system', { step_key: clock.stepKey, due_days: clock.dueDays, real_at: new Date().toISOString(), virtual_at: now.toISOString() }, now.toISOString()));
    if (holds) { for (const action of clock.actions) await runHandler(record, action, clock.stepKey); fired.push(clock.stepKey); }
  }
  return fired;
}

export async function getCaseBundle(record: CaseRecord): Promise<CaseBundle> {
  await evaluateCase(record);
  const [timeline, artifacts, clocks] = await Promise.all([repository.listEvents(record.id), repository.listArtifacts(record.id), repository.listClocks(record.id)]);
  const next = clocks.filter((item) => item.status === 'pending').sort((a, b) => a.dueDays - b.dueDays)[0];
  const nextClock = next ? {
    key: next.stepKey, label: next.stepKey.replaceAll('_', ' '),
    inDaysVirtual: Math.max(0, Math.ceil((new Date(record.createdAt).getTime() + next.dueDays * 86_400_000 - virtualNow(record).getTime()) / 86_400_000)),
    dueAt: new Date(new Date(record.createdAt).getTime() + next.dueDays * 86_400_000).toISOString(),
  } : undefined;
  return { case: record, timeline, artifacts, clocks, guidance: getGuidance(playbooks[record.category]?.guidance ?? [], record.language), nextClock };
}

export const signCaseToken = (caseId: string) => jwt.sign({ case_id: caseId, purpose: 'status' }, config.jwtSecret, { expiresIn: '30m' });
export function verifyCaseToken(token: string) { const payload = jwt.verify(token, config.jwtSecret) as { case_id: string; purpose: string }; if (payload.purpose !== 'status') throw new Error('Invalid token purpose'); return payload; }

export async function createStatusOtp(caseNumberValue: string) {
  const record = await repository.getCaseByNumber(caseNumberValue);
  if (!record) throw Object.assign(new Error('Case not found'), { statusCode: 404 });
  otpChallenges.set(record.id, { caseId: record.id, hash: hash(config.otpCode), attempts: 0, expiresAt: Date.now() + 15 * 60_000, verified: false });
  return { sent: true, phoneMasked: record.phoneMasked ?? '+91••••••0000', demoCode: config.demoMode ? config.otpCode : undefined };
}

export async function verifyStatusOtp(caseNumberValue: string, code: string) {
  const record = await repository.getCaseByNumber(caseNumberValue);
  if (!record) throw Object.assign(new Error('Case not found'), { statusCode: 404 });
  const challenge = otpChallenges.get(record.id);
  if (!challenge || challenge.expiresAt < Date.now() || challenge.attempts >= 3) throw Object.assign(new Error('OTP challenge expired or locked'), { statusCode: 401 });
  challenge.attempts += 1;
  if (challenge.hash !== hash(code)) throw Object.assign(new Error(`Incorrect code. ${Math.max(0, 3 - challenge.attempts)} attempts left.`), { statusCode: 401 });
  challenge.verified = true;
  return { token: signCaseToken(record.id), expiresIn: 1800 };
}

export async function getCaseAuthorized(caseNumberValue: string, token: string) {
  const payload = verifyCaseToken(token);
  const record = await repository.getCaseByNumber(caseNumberValue);
  if (!record || payload.case_id !== record.id) throw Object.assign(new Error('Case not found or token does not match'), { statusCode: 404 });
  return getCaseBundle(record);
}

export async function listOpsCases() {
  const cases = await repository.listCases();
  return Promise.all(cases.map((record) => getCaseBundle(record)));
}

export async function mutateCase(caseId: string, action: string, payload: Record<string, unknown>) {
  const record = await repository.getCaseById(caseId);
  if (!record) throw Object.assign(new Error('Case not found'), { statusCode: 404 });
  if (action === 'advance-time') {
    const days = Number(payload.days ?? 0); if (![1, 7, 14, 15, 29, 43].includes(days) && (days < 1 || days > 60)) throw Object.assign(new Error('Days must be between 1 and 60'), { statusCode: 422 });
    record.timeOffsetDays += days; record.updatedAt = new Date().toISOString(); await repository.saveCase(record);
    await repository.addEvent(makeEvent(record.id, 'time_advanced', 'ops', { days, total_offset_days: record.timeOffsetDays, simulated: true }, virtualNow(record).toISOString()));
  } else if (action === 'freeze-confirm') {
    if (record.track !== 'financial') throw Object.assign(new Error('Freeze confirmation applies only to financial cases'), { statusCode: 409 });
    const amount = Number(payload.amountHeld); record.slots.amount_held = amount; record.substatus = `₹${amount.toLocaleString('en-IN')} held (simulated)`; await repository.saveCase(record);
    await repository.addEvent(makeEvent(record.id, 'freeze_confirmed', 'ops', { amount_held: amount, label: `₹${amount.toLocaleString('en-IN')} shown as held`, simulated: true }, virtualNow(record).toISOString()));
    await addArtifact(record, 'restoration_request'); await sendCaseEmail(record, 'restoration');
  } else if (action === 'mark-fir') {
    const firNumber = String(payload.firNumber ?? '').trim(); if (!firNumber) throw Object.assign(new Error('FIR number is required'), { statusCode: 422 });
    await setStatus(record, 'fir_registered', 'ops'); await repository.addEvent(makeEvent(record.id, 'fir_marked', 'ops', { fir_number: firNumber, label: `FIR ${firNumber} recorded in mock ops` }, virtualNow(record).toISOString())); await sendCaseEmail(record, 'status');
  } else if (action === 'resolve') { await setStatus(record, 'resolved', 'ops'); await repository.addEvent(makeEvent(record.id, 'note', 'ops', { label: String(payload.note ?? 'Case resolved') }, virtualNow(record).toISOString())); await sendCaseEmail(record, 'status'); }
  else if (action === 'close') { await setStatus(record, 'closed', 'ops'); await repository.addEvent(makeEvent(record.id, 'note', 'ops', { label: String(payload.note ?? 'Case closed') }, virtualNow(record).toISOString())); }
  else if (action === 'note') { await repository.addEvent(makeEvent(record.id, 'note', 'ops', { label: String(payload.text ?? 'Ops note'), kind: payload.kind }, virtualNow(record).toISOString())); }
  else throw Object.assign(new Error('Unsupported operation'), { statusCode: 404 });
  await evaluateCase(record);
  return getCaseBundle(record);
}

export async function runAllTicks() {
  const cases = await repository.listCases(); const fired: Array<{ caseNumber: string; clocks: string[] }> = [];
  for (const record of cases) { const clocks = await evaluateCase(record); if (clocks.length) fired.push({ caseNumber: record.caseNumber, clocks }); }
  return { evaluated: cases.length, fired };
}
