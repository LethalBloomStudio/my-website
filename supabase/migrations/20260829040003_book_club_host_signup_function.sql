-- Book Club Phase 1: join the host-signup pool.
--
-- SECURITY DEFINER so it can write to book_club_host_signups (no client
-- INSERT policy exists, see previous migration) and, on the first signup
-- for a cycle, flip book_club_cycles from host_pending to host_grace and
-- set the 48h grace_window_deadline (no client UPDATE policy exists on
-- that table either). The `for update` row lock on the cycle serializes
-- concurrent "first signup" attempts so the window is only opened once.
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
  if v_uid is null or not public.bloom_circle_is_adult() then
    raise exception 'not permitted';
  end if;

  select status into v_status
  from public.book_club_cycles
  where id = p_cycle_id
  for update;

  if v_status is null then
    raise exception 'cycle not found';
  end if;
  if v_status not in ('host_pending', 'host_grace') then
    raise exception 'host signup is closed for this cycle';
  end if;

  select times_hosted into v_snapshot from public.book_club_host_stats where user_id = v_uid;

  insert into public.book_club_host_signups (cycle_id, user_id, times_hosted_snapshot)
  values (p_cycle_id, v_uid, coalesce(v_snapshot, 0))
  on conflict (cycle_id, user_id) do nothing;

  if v_status = 'host_pending' then
    update public.book_club_cycles
    set status = 'host_grace',
        grace_window_deadline = now() + interval '48 hours',
        updated_at = now()
    where id = p_cycle_id;
  end if;
end;
$$;
