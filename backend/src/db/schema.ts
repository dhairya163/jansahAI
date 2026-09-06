import {
  pgTable, uuid, text, boolean, numeric, timestamp, jsonb, integer, index, uniqueIndex, vector,
} from 'drizzle-orm/pg-core';

export const cases = pgTable('cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseNumber: text('case_number').unique().notNull(),
  track: text('track').notNull(),
  category: text('category').notNull(),
  status: text('status').notNull().default('draft'),
  substatus: text('substatus'),
  language: text('language'),
  anonymous: boolean('anonymous').notNull().default(false),
  onBehalfOf: boolean('on_behalf_of').notNull().default(false),
  reporterName: text('reporter_name'),
  victimName: text('victim_name'),
  phoneMasked: text('phone_masked'),
  email: text('email'),
  aadhaarLast4: text('aadhaar_last4'),
  amountLost: numeric('amount_lost'),
  incidentAt: timestamp('incident_at', { withTimezone: true }),
  slots: jsonb('slots').notNull().default({}),
  timeOffsetDays: integer('time_offset_days').notNull().default(0),
  registeredAt: timestamp('registered_at', { withTimezone: true }),
  amountHeld: numeric('amount_held'),
  firNumber: text('fir_number'),
  keepForDemo: boolean('keep_for_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('cases_status_idx2').on(t.status)]);

export const caseEvents = pgTable('case_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  actor: text('actor').notNull(),
  payload: jsonb('payload').notNull().default({}),
  virtualAt: timestamp('virtual_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('case_events_case_idx2').on(t.caseId, t.createdAt)]);

export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  storagePath: text('storage_path').notNull(),
  version: integer('version').notNull().default(1),
  meta: jsonb('meta').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const clocks = pgTable('clocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  stepKey: text('step_key').notNull(),
  dueDays: integer('due_days').notNull(),
  condition: text('condition').notNull(),
  action: jsonb('action').notNull(),
  status: text('status').notNull().default('pending'),
  firedAt: timestamp('fired_at', { withTimezone: true }),
}, (t) => [uniqueIndex('clocks_case_step_uq').on(t.caseId, t.stepKey)]);

export const otpChallenges = pgTable('otp_challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  purpose: text('purpose').notNull(),
  caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id'),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const suspects = pgTable('suspects', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').references(() => cases.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(),
  valueNorm: text('value_norm').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('suspects_kind_value_idx2').on(t.kind, t.valueNorm)]);

export const voiceSessions = pgTable('voice_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').references(() => cases.id, { onDelete: 'set null' }),
  sessionTokenHash: text('session_token_hash').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  model: text('model'),
  minutes: numeric('minutes'),
  transcript: jsonb('transcript').notNull().default([]),
  toolCalls: jsonb('tool_calls').notNull().default([]),
  // v2 — phone line
  channel: text('channel').notNull().default('web'),
  phoneMasked: text('phone_masked'),
  phoneE164: text('phone_e164'),
  callId: text('call_id'),
  twilioCallSid: text('twilio_call_sid'),
  callStatus: text('call_status'),
  consentAt: timestamp('consent_at', { withTimezone: true }),
});

export const handoffs = pgTable('handoffs', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => voiceSessions.id, { onDelete: 'set null' }),
  caseId: uuid('case_id').references(() => cases.id, { onDelete: 'set null' }),
  channel: text('channel').notNull(),
  reason: text('reason'),
  urgency: text('urgency'),
  aiSummary: text('ai_summary'),
  language: text('language'),
  status: text('status').notNull().default('queued'),
  assignedTo: text('assigned_to'),
  operatorKind: text('operator_kind').notNull().default('human'),   // 'ai' = simulated desk persona
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
});

export const handoffMessages = pgTable('handoff_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  handoffId: uuid('handoff_id').notNull().references(() => handoffs.id, { onDelete: 'cascade' }),
  sender: text('sender').notNull(),
  text: text('text').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const patterns = pgTable('patterns', {
  id: uuid('id').primaryKey().defaultRandom(),
  modus: text('modus').notNull(),
  title: text('title').notNull().default(''),
  brief: text('brief').notNull().default(''),
  titleHi: text('title_hi').notNull().default(''),
  briefHi: text('brief_hi').notNull().default(''),
  guidanceKeys: jsonb('guidance_keys').notNull().default([]),
  category: text('category'),
  centroid: vector('centroid', { dimensions: 1536 }),
  reportCount: integer('report_count').notNull().default(0),
  count30d: integer('count_30d').notNull().default(0),
  count7d: integer('count_7d').notNull().default(0),
  regions: jsonb('regions').notNull().default({}),
  identifiers: jsonb('identifiers').notNull().default([]),
  trend: jsonb('trend').notNull().default([]),
  firstSeen: timestamp('first_seen', { withTimezone: true }).notNull().defaultNow(),
  lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
  published: boolean('published').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const caseSignals = pgTable('case_signals', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }),
  patternId: uuid('pattern_id').references(() => patterns.id, { onDelete: 'set null' }),
  modus: text('modus').notNull(),
  impersonated: text('impersonated'),
  personaName: text('persona_name'),
  channel: text('channel'),
  region: text('region'),
  amountBand: text('amount_band'),
  hooks: jsonb('hooks').notNull().default([]),
  oneLine: text('one_line').notNull(),
  category: text('category'),
  embedding: vector('embedding', { dimensions: 1536 }),
  reportedAt: timestamp('reported_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const emails = pgTable('emails', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }),
  toAddr: text('to_addr').notNull(),
  template: text('template').notNull(),
  subject: text('subject').notNull(),
  status: text('status').notNull().default('queued'),
  payload: jsonb('payload').notNull().default({}),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CaseRow = typeof cases.$inferSelect;
export type CaseEventRow = typeof caseEvents.$inferSelect;
export type ArtifactRow = typeof artifacts.$inferSelect;
export type ClockRow = typeof clocks.$inferSelect;
export type SuspectRow = typeof suspects.$inferSelect;
export type VoiceSessionRow = typeof voiceSessions.$inferSelect;
export type HandoffRow = typeof handoffs.$inferSelect;
export type PatternRow = typeof patterns.$inferSelect;
export type CaseSignalRow = typeof caseSignals.$inferSelect;
