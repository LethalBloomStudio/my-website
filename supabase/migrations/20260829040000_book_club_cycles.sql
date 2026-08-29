-- Book Club Phase 1: cycle state-machine anchor.
--
-- Cycles are fully rolling / host-signup-driven, not calendar-month-aligned
-- (explicit product decision -- the original "1st to 1st" spec didn't
-- survive the "what if nobody signs up to host" question). A cycle only
-- advances once someone actually wants to host it. Full status lifecycle is
-- declared up front even though Phase 1 only ever produces the first two:
--   host_pending  -- no signups yet, open indefinitely
--   host_grace    -- first signup received, 48h window for competing
--                    signups before the least-times-hosted (random tiebreak)
--                    winner is selected
--   slate_building -- host picked, filling the up-to-5-book slate (Phase 2)
--   voting        -- 7-day participant vote on the slate (Phase 2)
--   active        -- book decided, cycle running (Phase 2+)
--   completed     -- cycle finished; a fresh host_pending row replaces it
--
-- The partial unique index below enforces "at most one live cycle at a
-- time" -- later phases lean on this invariant so "insert a fresh
-- host_pending row" is always safe once none exists, no locking needed.
create table public.book_club_cycles (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'host_pending'
    check (status in ('host_pending', 'host_grace', 'slate_building', 'voting', 'active', 'completed')),
  host_signup_opened_at timestamptz not null default now(),
  grace_window_deadline timestamptz,
  host_user_id uuid references auth.users(id),
  slate_building_deadline timestamptz,
  voting_opens_at timestamptz,
  voting_closes_at timestamptz,
  cycle_starts_at timestamptz,
  cycle_ends_at timestamptz,
  winning_book_option_id uuid, -- FK added once book_club_book_options exists (Phase 2)
  tie_pending boolean not null default false,
  tie_break_deadline timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index book_club_cycles_one_live_idx
  on public.book_club_cycles ((true))
  where status <> 'completed';

alter table public.book_club_cycles enable row level security;

-- Phase 1 only: host_pending/host_grace carry nothing sensitive (no book
-- slate, no thread, no vote results exist yet), so any adult can see them --
-- this is what lets the landing page show "sign up to host" to everyone.
-- Once slate_building/voting/active exist (Phase 2), this policy gets
-- replaced with one that also checks book_club_is_participant()/host, so
-- those later phases stay hidden from non-participants per the opt-in rule.
create policy book_club_cycles_select_early_phase
on public.book_club_cycles
for select
using (public.bloom_circle_is_adult() and status in ('host_pending', 'host_grace'));

-- No INSERT/UPDATE/DELETE policy for regular users -- every transition is
-- written by SECURITY DEFINER functions only (book_club_join_host_signup(),
-- advance_book_club_cycles()), matching Bloom Circle's original
-- privileged-writer-only pattern for its cycle-driven tables.

insert into public.book_club_cycles (status)
select 'host_pending'
where not exists (select 1 from public.book_club_cycles);
