-- Content reports: lets users report announcements or comments on profiles
create table if not exists public.profile_content_reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid not null references auth.users(id) on delete cascade,
  content_type      text not null, -- 'announcement' | 'comment'
  content_id        uuid not null,
  content_owner_id  uuid not null references auth.users(id) on delete cascade,
  reason            text not null,
  created_at        timestamptz not null default now()
);

alter table public.profile_content_reports enable row level security;

-- Reporter can insert their own reports
create policy "content_reports_insert_authenticated"
  on public.profile_content_reports for insert
  with check (auth.uid() = reporter_id);

-- Reporter can see their own submitted reports
create policy "content_reports_select_own"
  on public.profile_content_reports for select
  using (auth.uid() = reporter_id);
