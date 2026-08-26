alter table public.learners
  add column if not exists account text;

with ranked_accounts as (
  select
    id,
    lower(trim(display_name)) as normalized_account,
    row_number() over (
      partition by lower(trim(display_name))
      order by created_at, id
    ) as account_rank
  from public.learners
  where display_name is not null and trim(display_name) <> ''
)
update public.learners as learner
set account = case
  when ranked.account_rank = 1 then ranked.normalized_account
  else left(ranked.normalized_account, 31) || '-' || left(learner.id::text, 8)
end
from ranked_accounts as ranked
where learner.id = ranked.id and learner.account is null;

alter table public.learners
  add constraint learners_account_format
  check (
    account is null
    or (
      char_length(account) between 1 and 40
      and account = lower(trim(account))
    )
  );

create unique index learners_account_unique_idx
  on public.learners (account)
  where account is not null;
