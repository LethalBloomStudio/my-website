create table if not exists public.hidden_message_threads (
  user_id uuid not null references auth.users(id) on delete cascade,
  partner_id uuid not null references auth.users(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, partner_id),
  constraint hidden_message_threads_not_self check (user_id <> partner_id)
);

create index if not exists hidden_message_threads_user_hidden_idx
  on public.hidden_message_threads (user_id, hidden_at desc);

alter table public.hidden_message_threads enable row level security;

drop policy if exists "hidden_message_threads_select_own" on public.hidden_message_threads;
create policy "hidden_message_threads_select_own"
on public.hidden_message_threads for select
using (auth.uid() = user_id);

drop policy if exists "hidden_message_threads_insert_own" on public.hidden_message_threads;
create policy "hidden_message_threads_insert_own"
on public.hidden_message_threads for insert
with check (auth.uid() = user_id);

drop policy if exists "hidden_message_threads_update_own" on public.hidden_message_threads;
create policy "hidden_message_threads_update_own"
on public.hidden_message_threads for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "hidden_message_threads_delete_own" on public.hidden_message_threads;
create policy "hidden_message_threads_delete_own"
on public.hidden_message_threads for delete
using (auth.uid() = user_id);
