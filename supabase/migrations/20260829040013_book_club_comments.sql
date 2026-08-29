-- Book Club Phase 3: the cycle's single discussion thread.
--
-- One thread per cycle for the whole month, not per-week and not the
-- Bloom Circle 6-board structure -- so cycle_id (not a separate thread
-- table) is the FK everything hangs off. Same 2-level self-threaded
-- comment shape as bloom_circle_comments, but the recursion-safe parent
-- check (book_club_valid_parent_comment, SECURITY DEFINER) ships from the
-- start instead of being discovered the hard way after an "infinite
-- recursion detected in policy" error, per that exact lesson from
-- 20260829020001_bloom_circle_comments_fix_recursion.sql. updated_at /
-- editing also ship from day one -- Bloom Circle added that later, but
-- there's no reason to leave it out here now that the pattern is known.
create table public.book_club_comments (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.book_club_cycles(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  parent_comment_id uuid references public.book_club_comments(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index book_club_comments_cycle_idx
  on public.book_club_comments (cycle_id, created_at);

create or replace function public.book_club_valid_parent_comment(p_parent_comment_id uuid, p_cycle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_parent_comment_id is null or exists (
    select 1 from public.book_club_comments pc
    where pc.id = p_parent_comment_id
      and pc.cycle_id = p_cycle_id
      and pc.parent_comment_id is null
  );
$$;

alter table public.book_club_comments enable row level security;

-- Discussion only opens once the cycle is active (book decided) and stays
-- readable once completed; participancy is what "hidden until opt-in"
-- actually enforces here, since book_club_cycles itself is visible earlier.
create policy book_club_comments_select
on public.book_club_comments
for select
using (
  public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id and c.status in ('active', 'completed')
  )
);

create policy book_club_comments_insert
on public.book_club_comments
for insert
with check (
  author_id = auth.uid()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id and c.status = 'active'
  )
  and public.book_club_valid_parent_comment(parent_comment_id, cycle_id)
);

-- No lock, ever -- same as bloom_circle_comments_update_own.
create policy book_club_comments_update_own
on public.book_club_comments
for update
using (author_id = auth.uid() and public.bloom_circle_is_adult())
with check (author_id = auth.uid() and public.bloom_circle_is_adult());
