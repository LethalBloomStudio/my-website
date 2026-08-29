-- Book Club Phase 2: extend cycles visibility/state for slate/vote phases.
--
-- book_club_cycles itself never stores book titles/authors (those live in
-- book_club_book_options, which IS participant-gated) -- so letting any
-- adult see a non-completed cycle's status/timing/host doesn't leak
-- anything the "hidden until opt-in" rule cares about; it's what makes the
-- cycle discoverable at all so people know to opt in before voting closes.
-- A completed cycle's row is retired to participants/host only, since by
-- then there's no more "come opt in" reason to surface it broadly.
drop policy if exists book_club_cycles_select_early_phase on public.book_club_cycles;

create policy book_club_cycles_select
on public.book_club_cycles
for select
using (
  public.bloom_circle_is_adult()
  and (
    status <> 'completed'
    or host_user_id = auth.uid()
    or public.book_club_is_participant(id)
  )
);

-- Tracks whether the "zero books submitted" slate-building retry has
-- already been used once for this cycle (Phase 2 cron step 2) -- a second
-- empty window falls back to host_pending instead of extending again.
alter table public.book_club_cycles add column slate_extended boolean not null default false;
