create extension if not exists pgcrypto;

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.learners (
  id uuid primary key default gen_random_uuid(),
  display_name text check (display_name is null or char_length(display_name) between 1 and 40),
  token_hash text not null unique,
  paired_at timestamptz,
  token_rotated_at timestamptz not null default now(),
  last_seen timestamptz,
  current_mode text,
  current_question_id text,
  created_at timestamptz not null default now()
);

create table public.study_snapshots (
  learner_id uuid primary key references public.learners(id) on delete cascade,
  payload jsonb not null,
  client_updated_at bigint not null,
  updated_at timestamptz not null default now()
);

create table public.study_events (
  id bigint generated always as identity primary key,
  client_event_id uuid not null unique,
  learner_id uuid not null references public.learners(id) on delete cascade,
  event_type text not null,
  question_id text,
  chapter text,
  mode text,
  correct boolean,
  score integer,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index study_events_learner_created_idx
  on public.study_events (learner_id, created_at desc);

create table public.activity_minutes (
  learner_id uuid not null references public.learners(id) on delete cascade,
  minute_at timestamptz not null,
  primary key (learner_id, minute_at)
);

create or replace function public.is_study_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_study_admin() from public;
grant execute on function public.is_study_admin() to authenticated;

alter table public.admin_users enable row level security;
alter table public.learners enable row level security;
alter table public.study_snapshots enable row level security;
alter table public.study_events enable row level security;
alter table public.activity_minutes enable row level security;

revoke all on table public.admin_users from anon, authenticated;
revoke all on table public.learners from anon, authenticated;
revoke all on table public.study_snapshots from anon, authenticated;
revoke all on table public.study_events from anon, authenticated;
revoke all on table public.activity_minutes from anon, authenticated;

grant select on table public.admin_users to authenticated;
grant select on table public.learners to authenticated;
grant select on table public.study_snapshots to authenticated;
grant select on table public.study_events to authenticated;
grant select on table public.activity_minutes to authenticated;

create policy "Admins read admin users"
  on public.admin_users for select to authenticated
  using (public.is_study_admin());

create policy "Admins read learners"
  on public.learners for select to authenticated
  using (public.is_study_admin());

create policy "Admins read snapshots"
  on public.study_snapshots for select to authenticated
  using (public.is_study_admin());

create policy "Admins read events"
  on public.study_events for select to authenticated
  using (public.is_study_admin());

create policy "Admins read activity"
  on public.activity_minutes for select to authenticated
  using (public.is_study_admin());

alter table public.learners replica identity full;
alter table public.study_snapshots replica identity full;
alter table public.study_events replica identity full;
alter table public.activity_minutes replica identity full;

do $$
declare
  target_table text;
begin
  foreach target_table in array array['learners', 'study_snapshots', 'study_events', 'activity_minutes']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end $$;
