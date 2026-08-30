-- Book Club month view: the discussion thread moves from one thread per
-- cycle to one thread per week, so it can live inside each week's dropdown
-- rather than as a single feed at the bottom of the page.
--
-- No production traffic to preserve -- book_club is still behind the
-- book_club feature flag and nothing in project history indicates it has
-- been enabled for real users, so a blunt backfill to week 1 is fine here.
alter table public.book_club_comments add column week_number integer;
update public.book_club_comments set week_number = 1 where week_number is null;
alter table public.book_club_comments alter column week_number set not null;

create index book_club_comments_cycle_week_idx
  on public.book_club_comments (cycle_id, week_number, created_at);

drop policy if exists book_club_comments_select on public.book_club_comments;
drop policy if exists book_club_comments_insert on public.book_club_comments;

-- Extended with a week check: a reply must attach to a parent from its own
-- week, so a week's thread can't be stitched onto a different week's by
-- replying across the boundary. create or replace can't change the
-- argument list in place, so the old 2-arg version is dropped first.
drop function if exists public.book_club_valid_parent_comment(uuid, uuid);
create or replace function public.book_club_valid_parent_comment(p_parent_comment_id uuid, p_cycle_id uuid, p_week_number integer)
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
      and pc.week_number = p_week_number
      and pc.parent_comment_id is null
  );
$$;

-- Same participant + cycle-status gate as before, plus: only weeks that
-- have actually started are readable, matching
-- book_club_question_responses_select's identical protection (a client
-- can't set week_number to a not-yet-current week to peek at a thread that
-- doesn't exist yet -- there's nothing to peek at since posting to it is
-- blocked below, but this keeps the read side consistent with the write
-- side rather than relying on "nobody could have posted there anyway").
create policy book_club_comments_select
on public.book_club_comments
for select
using (
  public.book_club_feature_enabled()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id
      and c.status in ('active', 'completed')
      and (
        c.status = 'completed'
        or (c.cycle_starts_at is not null and week_number <= public.book_club_current_week_number(cycle_id))
      )
  )
);

-- Tightened from "cycle is active" to "this is the current week" -- a
-- completed cycle's weeks (all of them, by definition past) and any week
-- that isn't the live one right now are read-only. This is the actual
-- "closed weeks reject new comments" boundary; the UI hiding the reply box
-- on closed weeks is the cosmetic reflection of this, not the enforcement.
create policy book_club_comments_insert
on public.book_club_comments
for insert
with check (
  public.book_club_feature_enabled()
  and author_id = auth.uid()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id
      and c.status = 'active'
      and week_number = public.book_club_current_week_number(cycle_id)
  )
  and public.book_club_valid_parent_comment(parent_comment_id, cycle_id, week_number)
);
