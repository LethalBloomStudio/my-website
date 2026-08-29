-- Book Club Phase 2: extend the cycle engine with slate-building expiry and
-- voting close (including auto tiebreak). CREATE OR REPLACE on the same
-- function from Phase 1, per the "single function per tick" shape.
--
-- Step 1 (grace expiry) gains one line: the newly selected host is
-- auto-opted-in as a participant, since RLS on book_club_book_options/
-- votes/comments all gate on book_club_is_participant() -- without this the
-- host couldn't fill their own slate slots.
--
-- Step 2 (slate-building expiry): if the host/participants filled at least
-- one slot, open the 7-day vote. If the slate is still empty, extend the
-- window once (slate_extended flag); a second empty window abandons this
-- cycle back to host_pending -- clearing its signups/participants so a
-- fresh attempt doesn't inherit stale state. times_hosted is NOT reverted
-- here (confirmed: a selected host "spends" their turn regardless of what
-- happens next).
--
-- Step 3 (voting close): tallies book_club_book_votes via
-- book_club_tied_options(). A single leader wins outright. A tie sets
-- tie_pending + a 48h tie_break_deadline so the host can resolve it via
-- book_club_resolve_tie(); if the host doesn't act before the deadline,
-- this same step auto-picks randomly among the tied options next tick.
create or replace function public.advance_book_club_cycles()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cycle_row record;
  v_winner_user_id uuid;
  v_tied uuid[];
  v_slate_building_window constant interval := interval '48 hours';
  v_vote_window constant interval := interval '7 days';
  v_tiebreak_window constant interval := interval '48 hours';
  v_cycle_length constant interval := interval '28 days';
begin
  -- Step 1: grace expiry -> select host.
  for cycle_row in
    select id from public.book_club_cycles
    where status = 'host_grace' and grace_window_deadline <= now()
  loop
    select s.user_id into v_winner_user_id
    from public.book_club_host_signups s
    left join public.book_club_host_stats st on st.user_id = s.user_id
    where s.cycle_id = cycle_row.id
    order by coalesce(st.times_hosted, 0) asc, random()
    limit 1;

    if v_winner_user_id is not null then
      insert into public.book_club_host_stats (user_id, times_hosted, last_hosted_at)
      values (v_winner_user_id, 1, now())
      on conflict (user_id) do update
        set times_hosted = book_club_host_stats.times_hosted + 1,
            last_hosted_at = now();

      insert into public.book_club_participants (cycle_id, user_id)
      values (cycle_row.id, v_winner_user_id)
      on conflict (cycle_id, user_id) do nothing;

      update public.book_club_cycles
      set host_user_id = v_winner_user_id,
          status = 'slate_building',
          slate_building_deadline = now() + v_slate_building_window,
          updated_at = now()
      where id = cycle_row.id;
    end if;
  end loop;

  -- Step 2: slate-building expiry -> open voting, or retry/abandon if empty.
  for cycle_row in
    select id, slate_extended from public.book_club_cycles
    where status = 'slate_building' and slate_building_deadline <= now()
  loop
    if exists (select 1 from public.book_club_book_options where cycle_id = cycle_row.id) then
      update public.book_club_cycles
      set status = 'voting',
          voting_opens_at = now(),
          voting_closes_at = now() + v_vote_window,
          updated_at = now()
      where id = cycle_row.id;
    elsif not cycle_row.slate_extended then
      update public.book_club_cycles
      set slate_extended = true,
          slate_building_deadline = now() + v_slate_building_window,
          updated_at = now()
      where id = cycle_row.id;
    else
      delete from public.book_club_host_signups where cycle_id = cycle_row.id;
      delete from public.book_club_participants where cycle_id = cycle_row.id;
      update public.book_club_cycles
      set status = 'host_pending',
          host_user_id = null,
          grace_window_deadline = null,
          slate_building_deadline = null,
          slate_extended = false,
          updated_at = now()
      where id = cycle_row.id;
    end if;
  end loop;

  -- Step 3: voting close -> pick winner, or flag/auto-resolve a tie.
  for cycle_row in
    select id, tie_pending, tie_break_deadline from public.book_club_cycles
    where status = 'voting'
      and voting_closes_at <= now()
      and (not tie_pending or tie_break_deadline <= now())
  loop
    v_tied := public.book_club_tied_options(cycle_row.id);

    if v_tied is null or array_length(v_tied, 1) = 0 then
      continue; -- no slate at all; nothing to resolve (shouldn't happen)
    elsif array_length(v_tied, 1) = 1 then
      update public.book_club_cycles
      set winning_book_option_id = v_tied[1],
          status = 'active',
          tie_pending = false,
          tie_break_deadline = null,
          cycle_starts_at = now(),
          cycle_ends_at = now() + v_cycle_length,
          updated_at = now()
      where id = cycle_row.id;
    elsif cycle_row.tie_pending then
      -- already flagged and the host didn't resolve in time -- auto-pick.
      update public.book_club_cycles
      set winning_book_option_id = v_tied[1 + floor(random() * array_length(v_tied, 1))::int],
          status = 'active',
          tie_pending = false,
          tie_break_deadline = null,
          cycle_starts_at = now(),
          cycle_ends_at = now() + v_cycle_length,
          updated_at = now()
      where id = cycle_row.id;
    else
      update public.book_club_cycles
      set tie_pending = true,
          tie_break_deadline = now() + v_tiebreak_window,
          updated_at = now()
      where id = cycle_row.id;
    end if;
  end loop;
end;
$$;
