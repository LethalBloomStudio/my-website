alter table public.accounts
  add column if not exists parent_email text;

create table if not exists public.parental_consent_requests (
  id uuid primary key default gen_random_uuid(),
  child_user_id uuid not null references auth.users(id) on delete cascade,
  parent_email text not null,
  token uuid not null unique default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'expired')),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  approved_ip text
);

create index if not exists parental_consent_requests_child_idx
on public.parental_consent_requests (child_user_id, status, requested_at desc);

alter table public.parental_consent_requests enable row level security;

drop policy if exists "parental_consent_requests_select_own" on public.parental_consent_requests;
create policy "parental_consent_requests_select_own"
on public.parental_consent_requests for select
using (auth.uid() = child_user_id);

drop policy if exists "parental_consent_requests_insert_own" on public.parental_consent_requests;
create policy "parental_consent_requests_insert_own"
on public.parental_consent_requests for insert
with check (auth.uid() = child_user_id);

drop policy if exists "parental_consent_requests_update_own" on public.parental_consent_requests;
create policy "parental_consent_requests_update_own"
on public.parental_consent_requests for update
using (auth.uid() = child_user_id);

