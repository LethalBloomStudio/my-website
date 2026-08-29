-- Book Club Phase 6: clean-sweep bonus, cycle completion, and reopening.
--
-- Same mutex shape as book_club_weekly_checkmarks -- the unique constraint
-- on (cycle_id, user_id) is the concurrency guard, no client write policy,
-- only the cron function credits it. CLEAN_SWEEP_BONUS_COINS is a
-- placeholder (25), same adjustable-constant style as WEEKLY_CHECKMARK_COINS.
create table public.book_club_clean_sweep_bonuses (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.book_club_cycles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  unique (cycle_id, user_id)
);

alter table public.book_club_clean_sweep_bonuses enable row level security;

create policy book_club_clean_sweep_bonuses_select_own
on public.book_club_clean_sweep_bonuses
for select
using (auth.uid() = user_id);

create unique index bloom_coin_ledger_book_club_clean_sweep_unique
  on public.bloom_coin_ledger ((metadata ->> 'bonus_id'))
  where reason = 'book_club_clean_sweep_bonus';

-- Extends the cycle engine with cycle completion (step 5) and reopening the
-- next host-signup slot (step 6). Order matters: the checkmark safety-net
-- sweep (step 4) runs first so the final week's checkmark is already
-- recorded before the clean-sweep count here is taken.
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
  v_bonus_id uuid;
  v_slate_building_window constant interval := interval '48 hours';
  v_vote_window constant interval := interval '7 days';
  v_tiebreak_window constant interval := interval '48 hours';
  v_cycle_length constant interval := interval '28 days';
  v_cycle_length_weeks constant integer := 4;
  v_clean_sweep_bonus_coins constant integer := 25; -- CLEAN_SWEEP_BONUS_COINS placeholder
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
      continue;
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

  -- Step 4: weekly checkmark safety-net sweep.
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

  -- Step 5: cycle end -> clean-sweep bonus check -> completed.
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
        on conflict (cycle_id, user_id) do nothing
        returning id into v_bonus_id;

        if v_bonus_id is not null then
          perform public.increment_bloom_coins(participant_row.user_id, v_clean_sweep_bonus_coins);
          insert into public.bloom_coin_ledger (user_id, delta, reason, metadata)
          values (
            participant_row.user_id, v_clean_sweep_bonus_coins, 'book_club_clean_sweep_bonus',
            jsonb_build_object('bonus_id', v_bonus_id, 'cycle_id', cycle_row.id)
          );
        end if;
      end if;
    end loop;

    update public.book_club_cycles
    set status = 'completed', updated_at = now()
    where id = cycle_row.id;
  end loop;

  -- Step 6: reopen -> ensure a fresh host-signup slot always exists. The
  -- partial unique index on book_club_cycles (at most one non-completed
  -- row) makes this insert always safe.
  if not exists (select 1 from public.book_club_cycles where status <> 'completed') then
    insert into public.book_club_cycles (status) values ('host_pending');
  end if;
end;
$$;
