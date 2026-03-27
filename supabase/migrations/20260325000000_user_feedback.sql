create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  suggestions text[] not null default '{}',
  custom_text text,
  created_at timestamptz not null default now()
);

alter table public.user_feedback enable row level security;

-- Anyone (including anon) can insert feedback
create policy "user_feedback_insert"
  on public.user_feedback for insert
  with check (true);

-- Only admins can read feedback (via service role / admin API)
create policy "user_feedback_admin_select"
  on public.user_feedback for select
  using (
    exists (
      select 1 from public.accounts
      where accounts.user_id = auth.uid()
        and accounts.is_admin = true
    )
  );
