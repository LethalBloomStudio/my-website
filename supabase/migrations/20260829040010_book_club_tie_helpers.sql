-- Book Club Phase 2: shared tie computation + host-driven tiebreak.
--
-- book_club_tied_options() is used both by the cron's voting-close step and
-- by the host's manual resolve-tie action, so "what counts as tied" is
-- defined exactly once. Falls back to the whole slate if literally no votes
-- were cast (an empty vote shouldn't leave a cycle stuck forever).
create or replace function public.book_club_tied_options(p_cycle_id uuid)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result uuid[];
begin
  with counts as (
    select book_option_id, count(*) as n
    from public.book_club_book_votes
    where cycle_id = p_cycle_id
    group by book_option_id
  )
  select array_agg(book_option_id) into v_result
  from counts
  where n = (select max(n) from counts);

  if v_result is null then
    select array_agg(id) into v_result
    from public.book_club_book_options
    where cycle_id = p_cycle_id;
  end if;

  return v_result;
end;
$$;

-- Host's "final say" on a tie. Only usable while the cycle is actually
-- flagged tie_pending, only by that cycle's host, and only for an option
-- that's genuinely part of the tied set (so a host can't just crown an
-- also-ran that wasn't tied for first).
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
  v_cycle_length constant interval := interval '28 days';
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
      status = 'active',
      tie_pending = false,
      tie_break_deadline = null,
      cycle_starts_at = now(),
      cycle_ends_at = now() + v_cycle_length,
      updated_at = now()
  where id = p_cycle_id;
end;
$$;
