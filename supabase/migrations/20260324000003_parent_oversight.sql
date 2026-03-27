-- Manuscript parent-disable flag
alter table public.manuscripts
  add column if not exists parent_disabled boolean not null default false,
  add column if not exists parent_disabled_reason text,
  add column if not exists parent_disabled_by uuid references auth.users(id) on delete set null;

-- Parent-report restriction on accounts
alter table public.accounts
  add column if not exists parent_report_restricted boolean not null default false;

-- Parent reports table
create table if not exists public.parent_reports (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  youth_user_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  status text not null default 'pending',  -- 'pending' | 'cleared'
  admin_note text,
  cleared_at timestamptz,
  auto_restored boolean not null default false,
  created_at timestamptz not null default now()
);

-- Parent-report appeals (separate from conduct appeals)
create table if not exists public.parent_report_appeals (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.parent_reports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  status text not null default 'pending',  -- 'pending' | 'approved' | 'denied'
  admin_note text,
  created_at timestamptz not null default now()
);