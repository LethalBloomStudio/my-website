-- Add deactivation flag to accounts
alter table public.accounts
  add column if not exists is_deactivated boolean not null default false;

-- Snapshot table for deleted accounts (no FK to auth.users since user is gone)
create table if not exists public.deleted_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email_snapshot text,
  full_name_snapshot text,
  username_snapshot text,
  pen_name_snapshot text,
  age_category text,
  subscription_status text,
  bloom_coins bigint,
  reason text not null,
  deleted_at timestamptz not null default now()
);

-- Allow service role full access; no RLS needed (admin-only reads)
alter table public.deleted_accounts enable row level security;

create policy "service role manages deleted_accounts"
  on public.deleted_accounts
  using (true)
  with check (true);
