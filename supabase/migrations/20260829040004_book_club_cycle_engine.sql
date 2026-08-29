-- Book Club Phase 1: cycle engine, grace-expiry step only.
--
-- Later phases extend this same function via CREATE OR REPLACE (adding
-- slate-building expiry, voting close, cycle end, reopen, and a weekly-
-- checkmark safety-net sweep) rather than adding new functions, mirroring
-- advance_bloom_circle_cycles()'s single-function-per-tick shape. Phase 1
-- has exactly one transition to make: a cycle sitting in 'host_grace' past
-- its grace_window_deadline picks a host and moves to 'slate_building' --
-- that status already exists in the table's CHECK constraint, but nothing
-- yet advances a cycle out of it until Phase 2 lands.
--
-- Host selection: fewest times_hosted wins (a signup with no
-- book_club_host_stats row at all -- i.e. never hosted -- is treated as 0,
-- so it outranks anyone with a real count); ties broken by random().
create or replace function public.advance_book_club_cycles()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cycle_row record;
  v_winner_user_id uuid;
  v_slate_building_window constant interval := interval '48 hours';
begin
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

      update public.book_club_cycles
      set host_user_id = v_winner_user_id,
          status = 'slate_building',
          slate_building_deadline = now() + v_slate_building_window,
          updated_at = now()
      where id = cycle_row.id;
    end if;
  end loop;
end;
$$;
