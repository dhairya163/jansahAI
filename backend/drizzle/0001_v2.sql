-- v2: phone line, human handoff, scam radar (idempotent)
create extension if not exists vector;

alter table voice_sessions add column if not exists channel text not null default 'web';
alter table voice_sessions add column if not exists phone_masked text;
alter table voice_sessions add column if not exists phone_e164 text;      -- cleared when the call ends
alter table voice_sessions add column if not exists call_id text;         -- OpenAI SIP call id
alter table voice_sessions add column if not exists twilio_call_sid text;
alter table voice_sessions add column if not exists call_status text;     -- requested|ringing|in_progress|completed|failed
alter table voice_sessions add column if not exists consent_at timestamptz;
create index if not exists voice_sessions_call_idx on voice_sessions (call_id);

create table if not exists handoffs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references voice_sessions(id) on delete set null,
  case_id uuid references cases(id) on delete set null,
  channel text not null check (channel in ('web','phone')),
  reason text, urgency text,
  ai_summary text,
  language text,
  status text not null default 'queued' check (status in ('queued','accepted','closed')),
  assigned_to text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz, closed_at timestamptz
);
create index if not exists handoffs_status_idx on handoffs (status, created_at);

create table if not exists handoff_messages (
  id uuid primary key default gen_random_uuid(),
  handoff_id uuid not null references handoffs(id) on delete cascade,
  sender text not null check (sender in ('citizen','human','agent','system')),
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists handoff_messages_idx on handoff_messages (handoff_id, created_at);

create table if not exists patterns (
  id uuid primary key default gen_random_uuid(),
  modus text not null,
  title text not null default '',
  brief text not null default '',
  title_hi text not null default '',
  brief_hi text not null default '',
  guidance_keys jsonb not null default '[]',
  category text,
  centroid vector(1536),
  report_count int not null default 0,
  count_30d int not null default 0,
  count_7d int not null default 0,
  regions jsonb not null default '{}',
  identifiers jsonb not null default '[]',
  trend jsonb not null default '[]',
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists patterns_modus_idx on patterns (modus);

create table if not exists case_signals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id) on delete cascade,
  pattern_id uuid references patterns(id) on delete set null,
  modus text not null,
  impersonated text, persona_name text, channel text, region text, amount_band text,
  hooks jsonb not null default '[]',
  one_line text not null,
  category text,
  embedding vector(1536),
  reported_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists case_signals_pattern_idx on case_signals (pattern_id, reported_at);
create index if not exists case_signals_case_idx on case_signals (case_id);
