-- Book Club: "Group Thoughts and Discussion" -- a free-form thread at the
-- bottom of the active month, not tied to any week or reward mechanic.
-- Reuses book_club_comments/BookClubComments exactly as-is, rather than a
-- new table: week_number = 0 is a sentinel meaning "general" (the column
-- has no CHECK constraint, so this is schema-legal as-is). Always
-- readable/postable for any participant while the cycle is active, with
-- none of the per-week timing checks -- everything else about a week_number
-- (band-gated reads, current-week-only writes) is untouched for 1-4.
drop policy if exists book_club_comments_select on public.book_club_comments;
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
      and c.status = 'active'
      and (
        week_number = 0
        or (c.cycle_starts_at is not null and week_number <= public.book_club_current_week_number(cycle_id))
      )
  )
);

drop policy if exists book_club_comments_insert on public.book_club_comments;
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
      and (week_number = 0 or week_number = public.book_club_current_week_number(cycle_id))
  )
  and public.book_club_valid_parent_comment(parent_comment_id, cycle_id, week_number)
);
