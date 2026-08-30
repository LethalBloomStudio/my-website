-- Book Club next-month pipeline: the engine rewrite.
--
-- Old flow per cycle: first signup opens a 48h host_grace race -> host
-- picked -> 48h slate_building -> 7-day voting -> active immediately on
-- winner pick. New flow, anchored to planned_starts_at instead of
-- signup-timing:
--   host_pending      -- open for signup AND slate submissions (moved
--                         earlier -- see 20260829050005), no deadline
--                         until planned_starts_at - 14d
--   voting            -- opens the instant a host is selected at T-14d,
--                         runs exactly to T-7d (7 days, matching the old
--                         vote window length, just relocated)
--   questions_pending -- book decided, host finalizes the questionnaire;
--                         cycle_starts_at/cycle_ends_at stay unset until
--                         actual launch, so book_club_current_week_number()
--                         and the "commenced" questionnaire lock correctly
--                         report nothing has started yet
--   active            -- begins exactly at planned_starts_at, so the next
--                         month launches the instant the current one ends,
--                         no gap
--
-- Also folds in the coin-escrow change from requirement 4: weekly-checkmark
-- and clean-sweep-bonus coins are no longer paid at earn-time here -- see
-- 20260829050008, which removes the payout from
-- book_club_try_award_weekly_checkmark() and adds the rating-gated release.
-- This migration's step 5 already only records clean-sweep *eligibility*
-- (the insert into book_club_clean_sweep_bonuses), matching that -- the
-- actual increment_bloom_coins call for it is what 050008 removes.
create or replace function public.advance_book_club_cycles()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cycle_row record;
  participant_row record;
  v_winner_user_id uuid;
  v_tied uuid[];
  v_current_week integer;
  v_week integer;
  v_checkmark_count integer;
  v_tiebreak_window constant interval := interval '48 hours';
  v_cycle_length constant interval := interval '28 days';
  v_cycle_length_weeks constant integer := 4;
  v_furthest timestamptz;
  v_pending_count integer;
begin
  -- Step 1: T-14d reached -> select host, open voting immediately.
  -- Same least-times-hosted/random-tiebreak selection as before; only the
  -- trigger condition and the destination status changed (straight to
  -- voting, no slate_building -- the slate was built during host_pending).
  for cycle_row in
    select id, planned_starts_at from public.book_club_cycles
    where status = 'host_pending' and planned_starts_at is not null and now() >= planned_starts_at - interval '14 days'
  loop
    select s.user_id into v_winner_user_id
    from public.book_club_host_signups s
    left join public.book_club_host_stats st on st.user_id = s.user_id
    where s.cycle_id = cycle_row.id
      and s.status <> 'denied'
    order by coalesce(st.times_hosted, 0) asc, random()
    limit 1;

    -- No signups yet: leave it in host_pending: same "no-op, recheck next
    -- tick" fallback the old code had for an empty grace window. Known
    -- limitation carried forward, now more consequential (stalls the
    -- queue) -- flagged, not fixed, per the plan.
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
          status = 'voting',
          voting_opens_at = now(),
          voting_closes_at = cycle_row.planned_starts_at - interval '7 days',
          updated_at = now()
      where id = cycle_row.id;
    end if;
  end loop;

  -- Step 2: voting close -> pick winner, or flag/auto-resolve a tie.
  -- Destination is questions_pending, not active -- the book's decided but
  -- the questionnaire and the actual launch still wait for their own steps.
  for cycle_row in
    select id, tie_pending, tie_break_deadline from public.book_club_cycles
    where status = 'voting'
      and voting_closes_at <= now()
      and (not tie_pending or tie_break_deadline <= now())
  loop
    v_tied := public.book_club_tied_options(cycle_row.id);

    if v_tied is null or array_length(v_tied, 1) = 0 then
      continue;
    elsif array_length(v_tied, 1) = 1 then
      update public.book_club_cycles
      set winning_book_option_id = v_tied[1],
          status = 'questions_pending',
          tie_pending = false,
          tie_break_deadline = null,
          updated_at = now()
      where id = cycle_row.id;
    elsif cycle_row.tie_pending then
      update public.book_club_cycles
      set winning_book_option_id = v_tied[1 + floor(random() * array_length(v_tied, 1))::int],
          status = 'questions_pending',
          tie_pending = false,
          tie_break_deadline = null,
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

  -- Step 3: launch -- planned_starts_at reached -> active, with the book
  -- and (whatever the host has set of) the questionnaire already in place.
  -- Anchored to planned_starts_at rather than now(), so cycle_starts_at
  -- stays exactly on the queue's schedule even if this tick runs a few
  -- minutes late.
  for cycle_row in
    select id, planned_starts_at from public.book_club_cycles
    where status = 'questions_pending' and planned_starts_at <= now()
  loop
    update public.book_club_cycles
    set status = 'active',
        cycle_starts_at = cycle_row.planned_starts_at,
        cycle_ends_at = cycle_row.planned_starts_at + v_cycle_length,
        updated_at = now()
    where id = cycle_row.id;
  end loop;

  -- Step 4: weekly checkmark safety-net sweep. Unchanged.
  for cycle_row in
    select id from public.book_club_cycles
    where status = 'active' and cycle_starts_at is not null
  loop
    v_current_week := public.book_club_current_week_number(cycle_row.id);
    if v_current_week is not null then
      for participant_row in
        select user_id from public.book_club_participants where cycle_id = cycle_row.id
      loop
        for v_week in 1..v_current_week loop
          perform public.book_club_try_award_weekly_checkmark(cycle_row.id, participant_row.user_id, v_week);
        end loop;
      end loop;
    end if;
  end loop;

  -- Step 5: cycle end -> clean-sweep bonus *eligibility* (payout happens at
  -- rating time, see 20260829050008) -> completed.
  for cycle_row in
    select id from public.book_club_cycles
    where status = 'active' and cycle_ends_at <= now()
  loop
    for participant_row in
      select user_id from public.book_club_participants where cycle_id = cycle_row.id
    loop
      select count(*) into v_checkmark_count
      from public.book_club_weekly_checkmarks
      where cycle_id = cycle_row.id and user_id = participant_row.user_id;

      if v_checkmark_count >= v_cycle_length_weeks then
        insert into public.book_club_clean_sweep_bonuses (cycle_id, user_id)
        values (cycle_row.id, participant_row.user_id)
        on conflict (cycle_id, user_id) do nothing;
      end if;
    end loop;

    update public.book_club_cycles
    set status = 'completed', updated_at = now()
    where id = cycle_row.id;
  end loop;

  -- Step 6: refill -- keep 3 upcoming host_pending slots always queued
  -- beyond whatever's currently furthest scheduled (replaces the old "1
  -- open slot" backfill now that book_club_cycles_one_live_idx is gone).
  select max(planned_starts_at) into v_furthest
  from public.book_club_cycles
  where status <> 'completed';
  if v_furthest is null then
    v_furthest := now();
  end if;

  select count(*) into v_pending_count from public.book_club_cycles where status = 'host_pending';
  while v_pending_count < 3 loop
    v_furthest := v_furthest + v_cycle_length;
    insert into public.book_club_cycles (status, planned_starts_at) values ('host_pending', v_furthest);
    v_pending_count := v_pending_count + 1;
  end loop;
end;
$$;

-- book_club_resolve_tie(): same destination-status change as step 2 above
-- (host manually breaking a tie is the other path that used to jump
-- straight to 'active').
create or replace function public.book_club_resolve_tie(p_cycle_id uuid, p_book_option_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cycle record;
  v_tied uuid[];
begin
  select * into v_cycle from public.book_club_cycles where id = p_cycle_id for update;
  if v_cycle is null or v_cycle.host_user_id is distinct from v_uid then
    raise exception 'not permitted';
  end if;
  if v_cycle.status <> 'voting' or not v_cycle.tie_pending then
    raise exception 'no tie awaiting resolution for this cycle';
  end if;

  v_tied := public.book_club_tied_options(p_cycle_id);
  if not (p_book_option_id = any(v_tied)) then
    raise exception 'that option was not part of the tie';
  end if;

  update public.book_club_cycles
  set winning_book_option_id = p_book_option_id,
      status = 'questions_pending',
      tie_pending = false,
      tie_break_deadline = null,
      updated_at = now()
  where id = p_cycle_id;
end;
$$;

-- book_club_join_host_signup(): host_grace retired from the live flow, so
-- the only open-for-signup status left is host_pending.
create or replace function public.book_club_join_host_signup(p_cycle_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_snapshot integer;
begin
  if v_uid is null or not public.bloom_circle_is_adult() or not public.book_club_feature_enabled() then
    raise exception 'not permitted';
  end if;

  select status into v_status
  from public.book_club_cycles
  where id = p_cycle_id
  for update;

  if v_status is null then
    raise exception 'cycle not found';
  end if;
  if v_status <> 'host_pending' then
    raise exception 'host signup is closed for this cycle';
  end if;

  select times_hosted into v_snapshot from public.book_club_host_stats where user_id = v_uid;

  insert into public.book_club_host_signups (cycle_id, user_id, times_hosted_snapshot)
  values (p_cycle_id, v_uid, coalesce(v_snapshot, 0))
  on conflict (cycle_id, user_id) do nothing;
end;
$$;

drop policy if exists book_club_host_signups_delete_own_open on public.book_club_host_signups;
create policy book_club_host_signups_delete_own_open
on public.book_club_host_signups
for delete
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id and c.status = 'host_pending'
  )
);
