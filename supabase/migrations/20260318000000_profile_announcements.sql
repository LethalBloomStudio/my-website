-- Profile announcements: per-user public posts on their own profile
create table if not exists public.profile_announcements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  content     text not null,
  created_at  timestamptz not null default now()
);

alter table public.profile_announcements enable row level security;

create policy "announcements_select_public"
  on public.profile_announcements for select
  using (true);

create policy "announcements_insert_own"
  on public.profile_announcements for insert
  with check (auth.uid() = user_id);

create policy "announcements_delete_own"
  on public.profile_announcements for delete
  using (auth.uid() = user_id);

-- Likes on announcements
create table if not exists public.profile_announcement_likes (
  announcement_id  uuid not null references public.profile_announcements(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  created_at       timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

alter table public.profile_announcement_likes enable row level security;

create policy "announcement_likes_select_public"
  on public.profile_announcement_likes for select
  using (true);

create policy "announcement_likes_insert_own"
  on public.profile_announcement_likes for insert
  with check (auth.uid() = user_id);

create policy "announcement_likes_delete_own"
  on public.profile_announcement_likes for delete
  using (auth.uid() = user_id);

-- Comments on announcements
create table if not exists public.profile_announcement_comments (
  id               uuid primary key default gen_random_uuid(),
  announcement_id  uuid not null references public.profile_announcements(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  content          text not null,
  created_at       timestamptz not null default now()
);

alter table public.profile_announcement_comments enable row level security;

create policy "announcement_comments_select_public"
  on public.profile_announcement_comments for select
  using (true);

create policy "announcement_comments_insert_authenticated"
  on public.profile_announcement_comments for insert
  with check (auth.uid() = user_id);

-- Commenter can delete their own comment; profile owner can delete any comment on their announcements
create policy "announcement_comments_delete"
  on public.profile_announcement_comments for delete
  using (
    auth.uid() = user_id
    or auth.uid() = (
      select pa.user_id
      from public.profile_announcements pa
      where pa.id = announcement_id
    )
  );
