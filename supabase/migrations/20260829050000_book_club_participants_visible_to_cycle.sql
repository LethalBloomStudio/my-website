-- Book Club month view: let every participant see who else has opted into
-- the same cycle (needed for the "accepted readers"-style participant
-- avatar row). Previously book_club_participants_select_own only let a
-- caller see their own row -- nobody could query the full opted-in list.
--
-- SECURITY DEFINER, not the plain-SQL book_club_is_participant() -- this
-- check runs on book_club_participants itself, so a plain-SQL version would
-- re-trigger this same policy while evaluating its own inner subquery,
-- which is exactly the "infinite recursion detected in policy" bug already
-- hit and fixed in 20260829020001_bloom_circle_comments_fix_recursion.sql.
-- SECURITY DEFINER breaks the loop the same way that fix did: the inner
-- query runs as the function owner, which bypasses RLS on its own tables.
create or replace function public.book_club_caller_is_participant(p_cycle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.book_club_participants
    where cycle_id = p_cycle_id and user_id = auth.uid()
  );
$$;

-- book_club_participants_select_own stays as-is (not dropped) -- both
-- /book-club and /book-club/cycle read a caller's own participant row
-- unconditionally, regardless of cycle status (host_pending through
-- completed), to decide the "opted in?" redirect/gate. Narrowing that to
-- active/completed-only would break opt-in detection during slate_building
-- and voting. This new policy is additive: it only grants visibility into
-- *other* participants' rows, and only once the cycle has revealed its book
-- (active/completed), matching book_club_comments_select's same status gate
-- -- the full participant list during slate_building/voting stays private
-- the same way the slate does.
create policy book_club_participants_select_cycle
on public.book_club_participants
for select
using (
  public.book_club_feature_enabled()
  and public.book_club_caller_is_participant(cycle_id)
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id and c.status in ('active', 'completed')
  )
);
