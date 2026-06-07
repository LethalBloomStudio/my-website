create table public.notification_read_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_key text not null,
  read_at timestamptz not null default now(),
  unique (user_id, notification_key)
);

create index notification_read_keys_user_id_idx on public.notification_read_keys(user_id);

alter table public.notification_read_keys enable row level security;

create policy "Users can read own read keys"
  on public.notification_read_keys for select
  using (auth.uid() = user_id);

create policy "Users can insert own read keys"
  on public.notification_read_keys for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own read keys"
  on public.notification_read_keys for delete
  using (auth.uid() = user_id);
