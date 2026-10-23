-- Each device keeps its own token. No existing learner or study records are rewritten.
create table public.learner_sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  learner_id uuid not null references public.learners(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index learner_sessions_learner_id_idx on public.learner_sessions (learner_id);
alter table public.learner_sessions enable row level security;
revoke all on table public.learner_sessions from anon, authenticated;
grant all on table public.learner_sessions to service_role;
