-- v3: simulated help-desk operator (AI persona) vs human operator on a handoff
alter table handoffs add column if not exists operator_kind text not null default 'human';
