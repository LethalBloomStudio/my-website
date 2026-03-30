create table if not exists public.user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  manuscript_id uuid references public.manuscripts(id) on delete set null,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_notes enable row level security;

create policy "user_notes_select_own" on public.user_notes
  for select using (auth.uid() = user_id);

create policy "user_notes_insert_own" on public.user_notes
  for insert with check (auth.uid() = user_id);

create policy "user_notes_update_own" on public.user_notes
  for update using (auth.uid() = user_id);

create policy "user_notes_delete_own" on public.user_notes
  for delete using (auth.uid() = user_id);

create index if not exists user_notes_user_id_idx on public.user_notes (user_id);
create index if not exists user_notes_manuscript_id_idx on public.user_notes (manuscript_id);
