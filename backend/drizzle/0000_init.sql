-- Jansah.AI schema — spec §15 DDL, run as-is.
-- Additions over the spec (all required by other spec sections):
--   cases.registered_at  — §20 clock evaluator anchors due dates on registration time
--   cases.amount_held    — §16.2 freeze_confirm side effect / restoration artifact
--   cases.fir_number     — §16.2 mark_fir guard payload
--   cases.keep_for_demo  — §25.4 purge exemption flag

create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  case_number text unique not null,          -- 'YYYYMMDD' || 6 random digits
  track text not null check (track in ('financial','women_children','other')),
  category text not null,                    -- playbook key (§17)
  status text not null default 'draft' check (status in
    ('draft','registered','under_process','stalled','escalated_l1',
     'escalated_l2','fir_registered','resolved','withdrawn','closed')),
  substatus text,
  language text,                             -- e.g. 'hi', 'en', 'hi-en'
  anonymous boolean not null default false,
  on_behalf_of boolean not null default false,
  reporter_name text, victim_name text,      -- victim_name = reporter unless on_behalf_of
  phone_masked text, email text,
  aadhaar_last4 text,
  amount_lost numeric, incident_at timestamptz,
  slots jsonb not null default '{}',
  time_offset_days int not null default 0,
  registered_at timestamptz,
  amount_held numeric,
  fir_number text,
  keep_for_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cases_case_number_idx on cases (case_number);
create index if not exists cases_status_idx on cases (status);

-- Patch pre-existing tables (the Supabase project may already carry the spec §15 shape)
alter table cases add column if not exists registered_at timestamptz;
alter table cases add column if not exists amount_held numeric;
alter table cases add column if not exists fir_number text;
alter table cases add column if not exists keep_for_demo boolean not null default false;

create table if not exists case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  type text not null,      -- catalogue §16.3
  actor text not null check (actor in ('citizen','agent','system','ops')),
  payload jsonb not null default '{}',
  virtual_at timestamptz,  -- created_at + case offset at insert time
  created_at timestamptz not null default now()
);
create index if not exists case_events_case_idx on case_events (case_id, created_at);

create table if not exists artifacts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  kind text not null,      -- catalogue §21
  storage_path text not null, version int not null default 1,
  meta jsonb not null default '{}', created_at timestamptz not null default now()
);
create index if not exists artifacts_case_idx on artifacts (case_id);

create table if not exists clocks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  step_key text not null,                    -- unique per case: (case_id, step_key)
  due_days int not null,                     -- days after registration
  condition text not null,                   -- §20.2
  action jsonb not null,                     -- ordered handler list
  status text not null default 'pending' check (status in ('pending','fired','skipped')),
  fired_at timestamptz,
  unique (case_id, step_key)
);

create table if not exists otp_challenges (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('aadhaar_verify','status_lookup')),
  case_id uuid references cases(id) on delete cascade,
  session_id uuid,
  code_hash text not null, attempts int not null default 0,
  expires_at timestamptz not null, consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists suspects (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id) on delete set null,   -- null = seeded
  kind text not null check (kind in ('phone','upi','bank_account','url','email','handle')),
  value_norm text not null, created_at timestamptz not null default now()
);
create index if not exists suspects_kind_value_idx on suspects (kind, value_norm);

create table if not exists voice_sessions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id) on delete set null,
  session_token_hash text not null,
  started_at timestamptz not null default now(), ended_at timestamptz,
  model text, minutes numeric,
  transcript jsonb not null default '[]',    -- REDACTED before insert (§25.2)
  tool_calls jsonb not null default '[]'
);
create index if not exists voice_sessions_token_idx on voice_sessions (session_token_hash);

create table if not exists emails (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id) on delete cascade,
  to_addr text not null, template text not null, subject text not null,
  status text not null default 'queued', payload jsonb not null default '{}',
  sent_at timestamptz, created_at timestamptz not null default now()
);
