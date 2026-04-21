alter table public.discussion_posts
  add column if not exists is_pinned boolean not null default false,
  add column if not exists pinned_at timestamptz;
