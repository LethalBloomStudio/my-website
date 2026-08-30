-- Book Club closing mechanics: the "Closed" section's summary cards need to
-- be visible to any adult browsing /book-club, not just that cycle's own
-- participants -- same "decided and announced becomes public" reasoning
-- already used for the active cycle's winning book
-- (20260829040024_book_club_public_winning_book.sql). Three pieces:
-- book_club_cycles row itself, the participant list (for avatars), and an
-- aggregate completion stat.

-- book_club_cycles: previously a completed row was retired to
-- participants/host only ("no more come-opt-in reason to surface it
-- broadly" -- true before summary cards existed, not true now). This table
-- never stores book titles/authors/thread content itself (those live in
-- the participant-gated child tables), so opening every status to any
-- adult doesn't leak anything beyond what was already the rule for every
-- non-completed status.
drop policy if exists book_club_cycles_select on public.book_club_cycles;
create policy book_club_cycles_select
on public.book_club_cycles
for select
using (
  public.book_club_feature_enabled()
  and public.bloom_circle_is_adult()
);

-- book_club_participants: the active-cycle branch stays participant-gated
-- (matches book_club_comments_select etc. -- still opt-in-only mid-month);
-- the completed-cycle branch opens to any adult, for the summary card's
-- avatar row.
drop policy if exists book_club_participants_select_cycle on public.book_club_participants;
create policy book_club_participants_select_cycle
on public.book_club_participants
for select
using (
  public.book_club_feature_enabled()
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id
      and (
        (c.status = 'active' and public.book_club_caller_is_participant(cycle_id))
        or (c.status = 'completed' and public.bloom_circle_is_adult())
      )
  )
);

-- Aggregate-only, not row-level -- keeps individual per-user checkmark
-- history private (book_club_weekly_checkmarks stays select-own-only) while
-- still letting the summary card show "X of Y finished every week."
create or replace function public.book_club_cycle_completion_stats(p_cycle_id uuid)
returns table (participant_count bigint, full_sweep_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.book_club_participants where cycle_id = p_cycle_id),
    (
      select count(*) from (
        select user_id from public.book_club_weekly_checkmarks
        where cycle_id = p_cycle_id
        group by user_id
        having count(*) >= 4
      ) full_sweeps
    )
  where public.book_club_feature_enabled()
    and public.bloom_circle_is_adult()
    and exists (select 1 from public.book_club_cycles c where c.id = p_cycle_id and c.status = 'completed');
$$;
