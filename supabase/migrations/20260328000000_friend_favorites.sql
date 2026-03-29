-- Friend favorites: lets users mark specific friends as favorites
create table if not exists public.friend_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_user_id)
);

alter table public.friend_favorites enable row level security;

-- Users can only read their own favorites
drop policy if exists "friend_favorites_select_own" on public.friend_favorites;
create policy "friend_favorites_select_own"
  on public.friend_favorites for select
  using (auth.uid() = user_id);

-- Users can insert their own favorites
drop policy if exists "friend_favorites_insert_own" on public.friend_favorites;
create policy "friend_favorites_insert_own"
  on public.friend_favorites for insert
  with check (auth.uid() = user_id);

-- Users can delete their own favorites
drop policy if exists "friend_favorites_delete_own" on public.friend_favorites;
create policy "friend_favorites_delete_own"
  on public.friend_favorites for delete
  using (auth.uid() = user_id);
