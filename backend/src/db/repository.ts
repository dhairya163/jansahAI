import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Pool } from 'pg';

import { config } from '../config.js';
import type { ArtifactRecord, CaseEvent, CaseRecord, ClockRecord, EmailRecord, SuspectRecord, VoiceSessionRecord } from '../domain/types.js';
import { id } from '../lib/ids.js';

export interface Repository {
  listCases(): Promise<CaseRecord[]>;
  getCaseById(caseId: string): Promise<CaseRecord | undefined>;
  getCaseByNumber(caseNumber: string): Promise<CaseRecord | undefined>;
  saveCase(record: CaseRecord): Promise<void>;
  addEvent(event: CaseEvent): Promise<void>;
  listEvents(caseId: string): Promise<CaseEvent[]>;
  addArtifact(artifact: ArtifactRecord): Promise<void>;
  listArtifacts(caseId: string): Promise<ArtifactRecord[]>;
  addClock(clock: ClockRecord): Promise<void>;
  updateClock(clock: ClockRecord): Promise<void>;
  listClocks(caseId: string): Promise<ClockRecord[]>;
  addEmail(email: EmailRecord): Promise<void>;
  listEmails(caseId?: string): Promise<EmailRecord[]>;
  addSuspect(suspect: SuspectRecord): Promise<void>;
  findSuspects(kind: SuspectRecord['kind'], valueNorm: string): Promise<SuspectRecord[]>;
  saveVoiceSession(session: VoiceSessionRecord): Promise<void>;
  getVoiceSession(sessionId: string): Promise<VoiceSessionRecord | undefined>;
  reset?(): Promise<void>;
}

class MemoryRepository implements Repository {
  cases = new Map<string, CaseRecord>();
  events: CaseEvent[] = [];
  artifacts: ArtifactRecord[] = [];
  clocks: ClockRecord[] = [];
  emails: EmailRecord[] = [];
  suspects: SuspectRecord[] = [];
  voiceSessions = new Map<string, VoiceSessionRecord>();

  async listCases() { return [...this.cases.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async getCaseById(caseId: string) { return this.cases.get(caseId); }
  async getCaseByNumber(caseNumber: string) { return [...this.cases.values()].find((item) => item.caseNumber === caseNumber); }
  async saveCase(record: CaseRecord) { this.cases.set(record.id, structuredClone(record)); }
  async addEvent(event: CaseEvent) { this.events.push(structuredClone(event)); }
  async listEvents(caseId: string) { return this.events.filter((item) => item.caseId === caseId).sort((a, b) => b.virtualAt.localeCompare(a.virtualAt)); }
  async addArtifact(artifact: ArtifactRecord) {
    if (!this.artifacts.some((item) => item.caseId === artifact.caseId && item.kind === artifact.kind && item.version === artifact.version)) this.artifacts.push(structuredClone(artifact));
  }
  async listArtifacts(caseId: string) { return this.artifacts.filter((item) => item.caseId === caseId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async addClock(clock: ClockRecord) {
    if (!this.clocks.some((item) => item.caseId === clock.caseId && item.stepKey === clock.stepKey)) this.clocks.push(structuredClone(clock));
  }
  async updateClock(clock: ClockRecord) {
    const index = this.clocks.findIndex((item) => item.id === clock.id);
    if (index >= 0) this.clocks[index] = structuredClone(clock);
  }
  async listClocks(caseId: string) { return this.clocks.filter((item) => item.caseId === caseId); }
  async addEmail(email: EmailRecord) { this.emails.push(structuredClone(email)); }
  async listEmails(caseId?: string) { return caseId ? this.emails.filter((item) => item.caseId === caseId) : [...this.emails]; }
  async addSuspect(suspect: SuspectRecord) { this.suspects.push(structuredClone(suspect)); }
  async findSuspects(kind: SuspectRecord['kind'], valueNorm: string) { return this.suspects.filter((item) => item.kind === kind && item.valueNorm === valueNorm); }
  async saveVoiceSession(session: VoiceSessionRecord) { this.voiceSessions.set(session.id, structuredClone(session)); }
  async getVoiceSession(sessionId: string) { const session = this.voiceSessions.get(sessionId); return session ? structuredClone(session) : undefined; }
  async reset() { this.cases.clear(); this.events = []; this.artifacts = []; this.clocks = []; this.emails = []; this.suspects = []; this.voiceSessions.clear(); }
}

const toIso = (value: unknown) => value instanceof Date ? value.toISOString() : String(value);
const optionalIso = (value: unknown) => value == null ? undefined : toIso(value);

const fromCase = (row: Record<string, any>): CaseRecord => ({
  id: row.id, caseNumber: row.case_number, track: row.track, category: row.category, status: row.status, substatus: row.substatus ?? undefined,
  language: row.language ?? 'en', anonymous: row.anonymous, onBehalfOf: row.on_behalf_of, reporterName: row.reporter_name ?? undefined,
  victimName: row.victim_name ?? undefined, phoneMasked: row.phone_masked ?? undefined, email: row.email ?? undefined, aadhaarLast4: row.aadhaar_last4 ?? undefined,
  amountLost: row.amount_lost == null ? undefined : Number(row.amount_lost), incidentAt: optionalIso(row.incident_at), slots: row.slots ?? {},
  timeOffsetDays: row.time_offset_days ?? 0, keepForDemo: row.keep_for_demo ?? false, createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at),
});

const toCase = (record: CaseRecord) => ({
  id: record.id, case_number: record.caseNumber, track: record.track, category: record.category, status: record.status, substatus: record.substatus,
  language: record.language, anonymous: record.anonymous, on_behalf_of: record.onBehalfOf, reporter_name: record.reporterName,
  victim_name: record.victimName, phone_masked: record.phoneMasked, email: record.email, aadhaar_last4: record.aadhaarLast4,
  amount_lost: record.amountLost, incident_at: record.incidentAt, slots: record.slots, time_offset_days: record.timeOffsetDays,
  keep_for_demo: record.keepForDemo ?? false, created_at: record.createdAt, updated_at: record.updatedAt,
});

const fromVoiceSession = (row: Record<string, any>): VoiceSessionRecord => ({
  id: row.id,
  caseId: row.case_id ?? undefined,
  sessionTokenHash: row.session_token_hash,
  startedAt: toIso(row.started_at),
  endedAt: optionalIso(row.ended_at),
  model: row.model ?? '',
  voice: row.voice ?? 'marin',
  language: row.language ?? 'und',
  minutes: row.minutes == null ? undefined : Number(row.minutes),
  status: row.status ?? 'active',
  transcript: row.transcript ?? [],
  toolCalls: row.tool_calls ?? [],
  draft: row.draft ?? {},
  updatedAt: toIso(row.updated_at ?? row.started_at),
});

const toVoiceSession = (session: VoiceSessionRecord) => ({
  id: session.id,
  case_id: session.caseId,
  session_token_hash: session.sessionTokenHash,
  started_at: session.startedAt,
  ended_at: session.endedAt,
  model: session.model,
  voice: session.voice,
  language: session.language,
  minutes: session.minutes,
  status: session.status,
  transcript: session.transcript,
  tool_calls: session.toolCalls,
  draft: session.draft,
  updated_at: session.updatedAt,
});

class PostgresRepository implements Repository {
  constructor(private db: Pool) {}

  async listCases() { const { rows } = await this.db.query('select * from cases order by created_at desc'); return rows.map(fromCase); }
  async getCaseById(caseId: string) { const { rows } = await this.db.query('select * from cases where id = $1 limit 1', [caseId]); return rows[0] ? fromCase(rows[0]) : undefined; }
  async getCaseByNumber(caseNumber: string) { const { rows } = await this.db.query('select * from cases where case_number = $1 limit 1', [caseNumber]); return rows[0] ? fromCase(rows[0]) : undefined; }
  async saveCase(record: CaseRecord) {
    const row = toCase(record);
    await this.db.query(`insert into cases (
      id, case_number, track, category, status, substatus, language, anonymous, on_behalf_of,
      reporter_name, victim_name, phone_masked, email, aadhaar_last4, amount_lost, incident_at,
      slots, time_offset_days, keep_for_demo, created_at, updated_at
    ) values (${Array.from({ length: 21 }, (_, index) => `$${index + 1}`).join(',')})
    on conflict (id) do update set
      case_number=excluded.case_number, track=excluded.track, category=excluded.category, status=excluded.status,
      substatus=excluded.substatus, language=excluded.language, anonymous=excluded.anonymous,
      on_behalf_of=excluded.on_behalf_of, reporter_name=excluded.reporter_name, victim_name=excluded.victim_name,
      phone_masked=excluded.phone_masked, email=excluded.email, aadhaar_last4=excluded.aadhaar_last4,
      amount_lost=excluded.amount_lost, incident_at=excluded.incident_at, slots=excluded.slots,
      time_offset_days=excluded.time_offset_days, keep_for_demo=excluded.keep_for_demo, updated_at=excluded.updated_at`, [
      row.id, row.case_number, row.track, row.category, row.status, row.substatus, row.language, row.anonymous,
      row.on_behalf_of, row.reporter_name, row.victim_name, row.phone_masked, row.email, row.aadhaar_last4,
      row.amount_lost, row.incident_at, row.slots, row.time_offset_days, row.keep_for_demo, row.created_at, row.updated_at,
    ]);
  }
  async addEvent(event: CaseEvent) { await this.db.query('insert into case_events (id,case_id,type,actor,payload,virtual_at,created_at) values ($1,$2,$3,$4,$5,$6,$7)', [event.id, event.caseId, event.type, event.actor, event.payload, event.virtualAt, event.createdAt]); }
  async listEvents(caseId: string) { const { rows } = await this.db.query('select * from case_events where case_id=$1 order by virtual_at desc', [caseId]); return rows.map((row) => ({ id: row.id, caseId: row.case_id, type: row.type, actor: row.actor, payload: row.payload ?? {}, virtualAt: row.virtual_at instanceof Date ? row.virtual_at.toISOString() : row.virtual_at, createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at })); }
  async addArtifact(item: ArtifactRecord) { await this.db.query(`insert into artifacts (id,case_id,kind,storage_path,version,meta,created_at) values ($1,$2,$3,$4,$5,$6,$7) on conflict (case_id,kind,version) do update set storage_path=excluded.storage_path, meta=excluded.meta`, [item.id, item.caseId, item.kind, `generated/${item.id}.pdf`, item.version, { ...item.meta, label: item.label }, item.createdAt]); }
  async listArtifacts(caseId: string) { const { rows } = await this.db.query('select * from artifacts where case_id=$1 order by created_at desc', [caseId]); return rows.map((row) => ({ id: row.id, caseId: row.case_id, kind: row.kind, label: row.meta?.label ?? row.kind, version: row.version, meta: row.meta ?? {}, createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at })); }
  async addClock(item: ClockRecord) { await this.db.query(`insert into clocks (id,case_id,step_key,due_days,condition,action,status,fired_at) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (case_id,step_key) do update set due_days=excluded.due_days, condition=excluded.condition, action=excluded.action, status=excluded.status, fired_at=excluded.fired_at`, [item.id, item.caseId, item.stepKey, item.dueDays, item.condition, JSON.stringify(item.actions), item.status, item.firedAt]); }
  async updateClock(item: ClockRecord) { await this.db.query('update clocks set status=$1, fired_at=$2 where id=$3', [item.status, item.firedAt, item.id]); }
  async listClocks(caseId: string) { const { rows } = await this.db.query('select * from clocks where case_id=$1', [caseId]); return rows.map((row) => ({ id: row.id, caseId: row.case_id, stepKey: row.step_key, dueDays: row.due_days, condition: row.condition, actions: row.action, status: row.status, firedAt: row.fired_at instanceof Date ? row.fired_at.toISOString() : row.fired_at ?? undefined })); }
  async addEmail(item: EmailRecord) { await this.db.query('insert into emails (id,case_id,to_addr,template,subject,status,payload,sent_at,created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [item.id, item.caseId, item.toAddr, item.template, item.subject, item.status, item.payload, item.sentAt, item.createdAt]); }
  async listEmails(caseId?: string) { const { rows } = caseId ? await this.db.query('select * from emails where case_id=$1', [caseId]) : await this.db.query('select * from emails'); return rows.map((row) => ({ id: row.id, caseId: row.case_id ?? undefined, toAddr: row.to_addr, template: row.template, subject: row.subject, status: row.status, payload: row.payload ?? {}, sentAt: row.sent_at instanceof Date ? row.sent_at.toISOString() : row.sent_at ?? undefined, createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at })); }
  async addSuspect(item: SuspectRecord) { await this.db.query('insert into suspects (id,case_id,kind,value_norm) values ($1,$2,$3,$4)', [item.id, item.caseId, item.kind, item.valueNorm]); }
  async findSuspects(kind: SuspectRecord['kind'], valueNorm: string) { const { rows } = await this.db.query('select * from suspects where kind=$1 and value_norm=$2', [kind, valueNorm]); return rows.map((row) => ({ id: row.id, caseId: row.case_id ?? undefined, kind: row.kind, valueNorm: row.value_norm })); }
  async saveVoiceSession(session: VoiceSessionRecord) {
    const row = toVoiceSession(session);
    await this.db.query(`insert into voice_sessions (id,case_id,session_token_hash,started_at,ended_at,model,voice,language,minutes,status,transcript,tool_calls,draft,updated_at)
      values (${Array.from({ length: 14 }, (_, index) => `$${index + 1}`).join(',')})
      on conflict (id) do update set case_id=excluded.case_id, ended_at=excluded.ended_at, model=excluded.model,
      voice=excluded.voice, language=excluded.language, minutes=excluded.minutes, status=excluded.status,
      transcript=excluded.transcript, tool_calls=excluded.tool_calls, draft=excluded.draft, updated_at=excluded.updated_at`, [
      row.id, row.case_id, row.session_token_hash, row.started_at, row.ended_at, row.model, row.voice,
      row.language, row.minutes, row.status, JSON.stringify(row.transcript), JSON.stringify(row.tool_calls), row.draft, row.updated_at,
    ]);
  }
  async getVoiceSession(sessionId: string) { const { rows } = await this.db.query('select * from voice_sessions where id=$1 limit 1', [sessionId]); return rows[0] ? fromVoiceSession(rows[0]) : undefined; }
}

class SupabaseRepository implements Repository {
  constructor(private db: SupabaseClient) {}
  private unwrap<T>(result: { data: T | null; error: { message: string } | null }) { if (result.error) throw new Error(result.error.message); return result.data; }
  async listCases() { const data = this.unwrap(await this.db.from('cases').select('*').order('created_at', { ascending: false })); return (data ?? []).map(fromCase); }
  async getCaseById(caseId: string) { const data = this.unwrap(await this.db.from('cases').select('*').eq('id', caseId).maybeSingle()); return data ? fromCase(data) : undefined; }
  async getCaseByNumber(caseNumber: string) { const data = this.unwrap(await this.db.from('cases').select('*').eq('case_number', caseNumber).maybeSingle()); return data ? fromCase(data) : undefined; }
  async saveCase(record: CaseRecord) { this.unwrap(await this.db.from('cases').upsert(toCase(record))); }
  async addEvent(event: CaseEvent) { this.unwrap(await this.db.from('case_events').insert({ id: event.id, case_id: event.caseId, type: event.type, actor: event.actor, payload: event.payload, virtual_at: event.virtualAt, created_at: event.createdAt })); }
  async listEvents(caseId: string) { const data = this.unwrap(await this.db.from('case_events').select('*').eq('case_id', caseId).order('virtual_at', { ascending: false })); return (data ?? []).map((row: any) => ({ id: row.id, caseId: row.case_id, type: row.type, actor: row.actor, payload: row.payload, virtualAt: row.virtual_at, createdAt: row.created_at })); }
  async addArtifact(item: ArtifactRecord) { this.unwrap(await this.db.from('artifacts').upsert({ id: item.id, case_id: item.caseId, kind: item.kind, storage_path: `generated/${item.id}.pdf`, version: item.version, meta: { ...item.meta, label: item.label }, created_at: item.createdAt }, { onConflict: 'case_id,kind,version' })); }
  async listArtifacts(caseId: string) { const data = this.unwrap(await this.db.from('artifacts').select('*').eq('case_id', caseId).order('created_at', { ascending: false })); return (data ?? []).map((row: any) => ({ id: row.id, caseId: row.case_id, kind: row.kind, label: row.meta?.label ?? row.kind, version: row.version, meta: row.meta ?? {}, createdAt: row.created_at })); }
  async addClock(item: ClockRecord) { this.unwrap(await this.db.from('clocks').upsert({ id: item.id, case_id: item.caseId, step_key: item.stepKey, due_days: item.dueDays, condition: item.condition, action: item.actions, status: item.status, fired_at: item.firedAt }, { onConflict: 'case_id,step_key' })); }
  async updateClock(item: ClockRecord) { this.unwrap(await this.db.from('clocks').update({ status: item.status, fired_at: item.firedAt }).eq('id', item.id)); }
  async listClocks(caseId: string) { const data = this.unwrap(await this.db.from('clocks').select('*').eq('case_id', caseId)); return (data ?? []).map((row: any) => ({ id: row.id, caseId: row.case_id, stepKey: row.step_key, dueDays: row.due_days, condition: row.condition, actions: row.action, status: row.status, firedAt: row.fired_at ?? undefined })); }
  async addEmail(item: EmailRecord) { this.unwrap(await this.db.from('emails').insert({ id: item.id, case_id: item.caseId, to_addr: item.toAddr, template: item.template, subject: item.subject, status: item.status, payload: item.payload, sent_at: item.sentAt, created_at: item.createdAt })); }
  async listEmails(caseId?: string) { let query = this.db.from('emails').select('*'); if (caseId) query = query.eq('case_id', caseId); const data = this.unwrap(await query); return (data ?? []).map((row: any) => ({ id: row.id, caseId: row.case_id ?? undefined, toAddr: row.to_addr, template: row.template, subject: row.subject, status: row.status, payload: row.payload ?? {}, sentAt: row.sent_at ?? undefined, createdAt: row.created_at })); }
  async addSuspect(item: SuspectRecord) { this.unwrap(await this.db.from('suspects').insert({ id: item.id, case_id: item.caseId, kind: item.kind, value_norm: item.valueNorm })); }
  async findSuspects(kind: SuspectRecord['kind'], valueNorm: string) { const data = this.unwrap(await this.db.from('suspects').select('*').eq('kind', kind).eq('value_norm', valueNorm)); return (data ?? []).map((row: any) => ({ id: row.id, caseId: row.case_id ?? undefined, kind: row.kind, valueNorm: row.value_norm })); }
  async saveVoiceSession(session: VoiceSessionRecord) { this.unwrap(await this.db.from('voice_sessions').upsert(toVoiceSession(session))); }
  async getVoiceSession(sessionId: string) { const data = this.unwrap(await this.db.from('voice_sessions').select('*').eq('id', sessionId).maybeSingle()); return data ? fromVoiceSession(data) : undefined; }
}

const persistentDatabaseEnabled = process.env.NODE_ENV !== 'test';

export const repository: Repository = persistentDatabaseEnabled && config.databaseUrl
  ? new PostgresRepository(new Pool({ connectionString: config.databaseUrl, ssl: { rejectUnauthorized: false }, max: 5 }))
  : persistentDatabaseEnabled && config.supabaseUrl && config.supabaseServiceKey
    ? new SupabaseRepository(createClient(config.supabaseUrl, config.supabaseServiceKey, { auth: { persistSession: false } }))
    : new MemoryRepository();

export const makeEvent = (caseId: string, type: string, actor: CaseEvent['actor'], payload: Record<string, unknown>, virtualAt = new Date().toISOString()): CaseEvent => ({ id: id(), caseId, type, actor, payload, virtualAt, createdAt: new Date().toISOString() });
