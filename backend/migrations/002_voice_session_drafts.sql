alter table voice_sessions add column if not exists voice text;
alter table voice_sessions add column if not exists language text not null default 'und';
alter table voice_sessions add column if not exists draft jsonb not null default '{}';
alter table voice_sessions add column if not exists status text not null default 'active';
alter table voice_sessions add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'voice_sessions_language_check'
  ) then
    alter table voice_sessions add constraint voice_sessions_language_check
      check (language in ('und', 'en', 'hi', 'hi-en'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'voice_sessions_status_check'
  ) then
    alter table voice_sessions add constraint voice_sessions_status_check
      check (status in ('active', 'completed', 'abandoned'));
  end if;
end $$;

create index if not exists voice_sessions_started_at_idx on voice_sessions(started_at desc);
create index if not exists voice_sessions_case_id_idx on voice_sessions(case_id);
