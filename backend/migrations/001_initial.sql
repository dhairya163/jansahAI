create extension if not exists pgcrypto;

create table if not exists cases (
  id uuid primary key default gen_random_uuid(), case_number text unique not null,
  track text not null check (track in ('financial','women_children','other')),
  category text not null, status text not null default 'draft', substatus text,
  language text, anonymous boolean not null default false, on_behalf_of boolean not null default false,
  reporter_name text, victim_name text, phone_masked text, email text, aadhaar_last4 text,
  amount_lost numeric, incident_at timestamptz, slots jsonb not null default '{}',
  time_offset_days int not null default 0, keep_for_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists cases_case_number_idx on cases(case_number);
create index if not exists cases_status_idx on cases(status);

create table if not exists case_events (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references cases(id) on delete cascade,
  type text not null, actor text not null check (actor in ('citizen','agent','system','ops')),
  payload jsonb not null default '{}', virtual_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists case_events_case_idx on case_events(case_id, created_at);

create table if not exists artifacts (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references cases(id) on delete cascade,
  kind text not null, storage_path text not null, version int not null default 1,
  meta jsonb not null default '{}', created_at timestamptz not null default now(),
  unique(case_id, kind, version)
);

create table if not exists clocks (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references cases(id) on delete cascade,
  step_key text not null, due_days int not null, condition text not null, action jsonb not null,
  status text not null default 'pending' check (status in ('pending','fired','skipped')), fired_at timestamptz,
  unique(case_id, step_key)
);

create table if not exists otp_challenges (
  id uuid primary key default gen_random_uuid(), purpose text not null, case_id uuid references cases(id) on delete cascade,
  session_id uuid, code_hash text not null, attempts int not null default 0, expires_at timestamptz not null,
  consumed_at timestamptz, created_at timestamptz not null default now()
);

create table if not exists suspects (
  id uuid primary key default gen_random_uuid(), case_id uuid references cases(id) on delete set null,
  kind text not null, value_norm text not null, created_at timestamptz not null default now()
);
create index if not exists suspects_lookup_idx on suspects(kind, value_norm);

create table if not exists voice_sessions (
  id uuid primary key default gen_random_uuid(), case_id uuid references cases(id) on delete set null,
  session_token_hash text not null, started_at timestamptz not null default now(), ended_at timestamptz,
  model text, minutes numeric, transcript jsonb not null default '[]', tool_calls jsonb not null default '[]'
);

create table if not exists emails (
  id uuid primary key default gen_random_uuid(), case_id uuid references cases(id) on delete cascade,
  to_addr text not null, template text not null, subject text not null, status text not null default 'queued',
  payload jsonb not null default '{}', sent_at timestamptz, created_at timestamptz not null default now()
);

alter table cases enable row level security;
alter table case_events enable row level security;
alter table artifacts enable row level security;
alter table clocks enable row level security;
alter table otp_challenges enable row level security;
alter table suspects enable row level security;
alter table voice_sessions enable row level security;
alter table emails enable row level security;

-- No public policies: only the backend service-role key may access these tables.
