-- Profile follows: lets users follow an author's public profile
create table if not exists public.profile_follows (
  follower_id  uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint no_self_follow check (follower_id <> following_id)
);

alter table public.profile_follows enable row level security;

-- Follower counts are public (anyone can read)
create policy "follows_select_public"
  on public.profile_follows for select
  using (true);

-- Authenticated users can follow others
create policy "follows_insert_own"
  on public.profile_follows for insert
  with check (auth.uid() = follower_id);

-- Users can unfollow
create policy "follows_delete_own"
  on public.profile_follows for delete
  using (auth.uid() = follower_id);
