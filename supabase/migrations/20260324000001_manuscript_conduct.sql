alter table public.accounts
  add column if not exists manuscript_conduct_strikes int not null default 0;

alter table public.accounts
  add column if not exists manuscript_suspended_until timestamptz;

alter table public.accounts
  add column if not exists manuscript_blacklisted boolean not null default false;

alter table public.accounts
  add column if not exists manuscript_lifetime_suspension_count int not null default 0;
