create table if not exists public.community_announcements (
  audience text primary key check (audience in ('adult', 'youth')),
  message text not null,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.community_announcements enable row level security;

drop policy if exists "community announcements read" on public.community_announcements;
create policy "community announcements read"
on public.community_announcements
for select
to authenticated
using (true);
