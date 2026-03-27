-- Conduct appeals: users submit a written appeal when suspended or blacklisted.
-- Admins review and approve/deny from the admin dashboard.

create table if not exists public.conduct_appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  status text not null default 'pending',   -- pending | approved | denied
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now()
);

alter table public.conduct_appeals enable row level security;

-- Users can view their own appeals
create policy "Users view own appeals"
  on public.conduct_appeals for select
  using (auth.uid() = user_id);

-- Users can insert their own appeals
create policy "Users insert own appeals"
  on public.conduct_appeals for insert
  with check (auth.uid() = user_id);

-- Add lifetime suspension counter — increments each time a 3-day suspension is applied, never resets
alter table public.accounts
  add column if not exists lifetime_suspension_count int not null default 0;
