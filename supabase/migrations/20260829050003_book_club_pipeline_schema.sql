-- Book Club next-month pipeline: schema changes to support several
-- non-completed cycles existing at once (the active month + up to 3
-- upcoming host-signup slots), instead of the "exactly one live cycle"
-- invariant Phase 1 was built around.
--
-- book_club_cycles_one_live_idx enforced "at most one non-completed row,
-- ever" -- later phases explicitly leaned on that to make "insert a fresh
-- host_pending row" always safe. That invariant is retired. What's still
-- true, and worth keeping enforced: at most one row is ever the *live*
-- month (status = 'active').
drop index if exists public.book_club_cycles_one_live_idx;

create unique index book_club_cycles_one_active_idx
  on public.book_club_cycles ((true))
  where status = 'active';

-- Every future cycle now gets a scheduled launch date up front, instead of
-- deriving timing from a signup-triggered 48h grace window. This is what
-- "2 weeks before the active month ends" / "1 week before" get computed
-- from: host selection at planned_starts_at - 14d, voting closes at
-- planned_starts_at - 7d, the cycle actually goes active at
-- planned_starts_at itself.
alter table public.book_club_cycles add column planned_starts_at timestamptz;

-- 'questions_pending' is the new final-week phase: book decided, host
-- finalizing the questionnaire, not live yet. 'host_grace' and
-- 'slate_building' stay in the allowed set for any historical rows but the
-- rewritten engine (next migration) never produces them again -- host
-- selection is immediate at T-14d (no signup-race grace window) and slate
-- submissions move to happening during host_pending itself.
alter table public.book_club_cycles drop constraint if exists book_club_cycles_status_check;
alter table public.book_club_cycles add constraint book_club_cycles_status_check
  check (status in ('host_pending', 'host_grace', 'slate_building', 'voting', 'questions_pending', 'active', 'completed'));

-- Backfill: give any existing non-completed rows a planned_starts_at, then
-- top up the queue to 3 upcoming host_pending slots beyond whatever's
-- already scheduled. Written as a plain do-block, not a reusable function,
-- since this is a one-time transition -- the rewritten
-- advance_book_club_cycles() (next migration) is what keeps 3 slots
-- topped up going forward.
do $$
declare
  v_active_ends_at timestamptz;
  v_base timestamptz;
  v_furthest timestamptz;
  v_pending_count integer;
begin
  select cycle_ends_at into v_active_ends_at from public.book_club_cycles where status = 'active';
  v_base := coalesce(v_active_ends_at, now());

  update public.book_club_cycles
  set planned_starts_at = cycle_starts_at
  where status = 'active' and planned_starts_at is null;

  -- Under the old invariant there was at most one other non-completed row
  -- (host_pending/host_grace/slate_building/voting) -- it's next in line
  -- after whatever's active (or after now(), if nothing is).
  update public.book_club_cycles
  set planned_starts_at = v_base
  where status not in ('completed', 'active') and planned_starts_at is null;

  select max(planned_starts_at) into v_furthest
  from public.book_club_cycles
  where status <> 'completed';
  if v_furthest is null then
    v_furthest := v_base - interval '28 days';
  end if;

  select count(*) into v_pending_count from public.book_club_cycles where status = 'host_pending';
  while v_pending_count < 3 loop
    v_furthest := v_furthest + interval '28 days';
    insert into public.book_club_cycles (status, planned_starts_at) values ('host_pending', v_furthest);
    v_pending_count := v_pending_count + 1;
  end loop;
end $$;
