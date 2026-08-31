-- Book Club: notify a user the moment they become a cycle's host, across
-- all three code paths that ever set host_user_id -- the automatic weekly
-- selection (advance_book_club_cycles step 1), the admin force-launch
-- override (book_club_admin_assign), and the admin reassignment override
-- (book_club_admin_change_host). Uses the existing system_notifications
-- table and its generic metadata.link/link_label rendering (already used
-- by direct-message and announcement notifications), no new table needed.
-- dedupe_key keyed to the cycle (and, for reassignment, also unique per
-- call since a cycle could change host more than once) prevents duplicate
-- notifications if a function ever re-runs for the same cycle.

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

      insert into public.system_notifications (user_id, category, title, body, severity, dedupe_key, metadata)
      values (
        v_winner_user_id, 'book_club_host',
        'You''ve been chosen to host Book Club',
        'You''re hosting this month''s book club. Add your reserved book pick once voting opens, then finalize the discussion questions before launch.',
        'info', 'book-club-host-' || cycle_row.id::text,
        jsonb_build_object('link', '/book-club/cycle/' || cycle_row.id, 'link_label', 'View Book Club', 'cycle_id', cycle_row.id)
      )
      on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
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
  -- rating time) -> completed.
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
  -- beyond whatever's currently furthest scheduled.
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

create or replace function public.book_club_admin_assign(
  p_cycle_id uuid, p_host_user_id uuid, p_book_title text, p_book_author text, p_cover_image_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_next_slot integer;
  v_option_id uuid;
  v_cycle_length constant interval := interval '28 days';
begin
  if auth.uid() is not null then
    raise exception 'not permitted';
  end if;

  select status into v_status from public.book_club_cycles where id = p_cycle_id;
  if v_status is null or v_status = 'completed' then
    raise exception 'cycle not found or already completed';
  end if;

  select coalesce(max(slot_number), 0) + 1 into v_next_slot
  from public.book_club_book_options where cycle_id = p_cycle_id;

  insert into public.book_club_book_options (cycle_id, slot_number, submitted_by, book_title, book_author, cover_image_url)
  values (p_cycle_id, v_next_slot, p_host_user_id, p_book_title, p_book_author, p_cover_image_url)
  returning id into v_option_id;

  insert into public.book_club_host_stats (user_id, times_hosted, last_hosted_at)
  values (p_host_user_id, 1, now())
  on conflict (user_id) do update
    set times_hosted = book_club_host_stats.times_hosted + 1, last_hosted_at = now();

  insert into public.book_club_participants (cycle_id, user_id)
  values (p_cycle_id, p_host_user_id)
  on conflict (cycle_id, user_id) do nothing;

  update public.book_club_cycles
  set host_user_id = p_host_user_id,
      winning_book_option_id = v_option_id,
      status = 'active',
      tie_pending = false,
      tie_break_deadline = null,
      cycle_starts_at = now(),
      cycle_ends_at = now() + v_cycle_length,
      updated_at = now()
  where id = p_cycle_id;

  insert into public.system_notifications (user_id, category, title, body, severity, dedupe_key, metadata)
  values (
    p_host_user_id, 'book_club_host',
    'You''ve been chosen to host Book Club',
    'You''re hosting this month''s book club, ' || p_book_title || ' by ' || p_book_author || '.',
    'info', 'book-club-host-' || p_cycle_id::text,
    jsonb_build_object('link', '/book-club/cycle/' || p_cycle_id, 'link_label', 'View Book Club', 'cycle_id', p_cycle_id)
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

create or replace function public.book_club_admin_change_host(p_cycle_id uuid, p_new_host_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_host_user_id uuid;
  v_found boolean;
begin
  if auth.uid() is not null then
    raise exception 'not permitted';
  end if;

  select host_user_id, true into v_old_host_user_id, v_found from public.book_club_cycles where id = p_cycle_id;
  if not coalesce(v_found, false) then
    raise exception 'cycle not found';
  end if;

  if v_old_host_user_id is not null and v_old_host_user_id <> p_new_host_user_id then
    update public.book_club_host_stats
    set times_hosted = greatest(0, times_hosted - 1)
    where user_id = v_old_host_user_id;
  end if;

  insert into public.book_club_host_stats (user_id, times_hosted, last_hosted_at)
  values (p_new_host_user_id, 1, now())
  on conflict (user_id) do update
    set times_hosted = book_club_host_stats.times_hosted + 1,
        last_hosted_at = now();

  insert into public.book_club_participants (cycle_id, user_id)
  values (p_cycle_id, p_new_host_user_id)
  on conflict (cycle_id, user_id) do nothing;

  update public.book_club_cycles
  set host_user_id = p_new_host_user_id, updated_at = now()
  where id = p_cycle_id;

  insert into public.system_notifications (user_id, category, title, body, severity, dedupe_key, metadata)
  values (
    p_new_host_user_id, 'book_club_host',
    'You''ve been chosen to host Book Club',
    'You''re hosting this month''s book club.',
    'info', 'book-club-host-' || p_cycle_id::text || '-' || now()::text,
    jsonb_build_object('link', '/book-club/cycle/' || p_cycle_id, 'link_label', 'View Book Club', 'cycle_id', p_cycle_id)
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;
