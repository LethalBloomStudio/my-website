-- Book Club Phase 8: access-control audit pass -- two fixes.
--
-- 1. book_club_try_award_weekly_checkmark(p_cycle_id, p_user_id, p_week)
-- took p_user_id as a raw parameter with no check that the caller is that
-- user. It couldn't fabricate a checkmark for someone who hadn't actually
-- qualified (it still requires that user's own genuine response + a
-- separate engagement row to exist), but any authenticated client could
-- invoke it for an arbitrary other user's id -- improper scoping for a
-- SECURITY DEFINER function. Fix mirrors the same "only enforce when
-- there's a real session" trick used for book_club_my_tied_options: cron
-- calls this with no session (auth.uid() is null) and must stay unaffected,
-- so the check only fires for real end-user calls, and only ever lets them
-- trigger evaluation of their own qualifying actions -- exactly what the
-- legitimate routes already do on their behalf, so no legitimate path breaks.
create or replace function public.book_club_try_award_weekly_checkmark(
  p_cycle_id uuid, p_user_id uuid, p_week_number integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle_starts_at timestamptz;
  v_week_start timestamptz;
  v_week_end timestamptz;
  v_answered boolean;
  v_engaged boolean;
  v_checkmark_id uuid;
  v_checkmark_coins constant integer := 10;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'not permitted';
  end if;

  select cycle_starts_at into v_cycle_starts_at from public.book_club_cycles where id = p_cycle_id;
  if v_cycle_starts_at is null then
    return;
  end if;
  v_week_start := v_cycle_starts_at + ((p_week_number - 1) * interval '7 days');
  v_week_end := v_week_start + interval '7 days';

  select exists (
    select 1 from public.book_club_question_responses r
    where r.cycle_id = p_cycle_id and r.week_number = p_week_number and r.user_id = p_user_id
  ) into v_answered;

  if not v_answered then
    return;
  end if;

  select
    exists (
      select 1 from public.book_club_check_ins
      where cycle_id = p_cycle_id and user_id = p_user_id and week_number = p_week_number
    )
    or exists (
      select 1 from public.book_club_comments
      where cycle_id = p_cycle_id and author_id = p_user_id
        and created_at >= v_week_start and created_at < v_week_end
    )
  into v_engaged;

  if not v_engaged then
    return;
  end if;

  insert into public.book_club_weekly_checkmarks (cycle_id, user_id, week_number, qualifying_actions)
  values (p_cycle_id, p_user_id, p_week_number, jsonb_build_object('answered_question', true, 'engaged', true))
  on conflict (cycle_id, user_id, week_number) do nothing
  returning id into v_checkmark_id;

  if v_checkmark_id is not null then
    perform public.increment_bloom_coins(p_user_id, v_checkmark_coins);
    insert into public.bloom_coin_ledger (user_id, delta, reason, metadata)
    values (
      p_user_id, v_checkmark_coins, 'book_club_weekly_checkmark',
      jsonb_build_object('checkmark_id', v_checkmark_id, 'cycle_id', p_cycle_id, 'week_number', p_week_number)
    );
  end if;
end;
$$;

-- 2. advance_book_club_cycles() is a cron target only -- nothing in the app
-- calls it from the client, and pg_cron itself runs as a role that bypasses
-- grants entirely, so revoking PUBLIC execute closes off an unnecessary
-- surface (repeated on-demand invocation of the whole cycle engine) without
-- affecting the actual cron schedule.
revoke execute on function public.advance_book_club_cycles() from public;
