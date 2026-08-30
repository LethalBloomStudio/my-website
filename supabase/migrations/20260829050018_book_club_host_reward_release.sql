-- Book Club: the host's flat 250-coin reward, released through the exact
-- same personal-gate mechanism as everyone else's checkmark/clean-sweep
-- payout -- submitting a rating. Same book_club_coin_releases mutex, same
-- "insert-with-on-conflict-do-nothing decides whether this actually pays"
-- shape; only the amount-computation branches on whether the caller is
-- this cycle's host.
--
-- Host doesn't earn checkmark/clean-sweep coins (member-only, per spec) --
-- they may still answer questions and accumulate checkmark rows for their
-- own progress display, those rows just aren't counted into their payout
-- here. Instead: a flat 250 if all three of the month's minimums are met
-- (>=3 replies to members' answers, >=5 likes given, >=2 Group Thoughts
-- posts) -- counted across the whole month, not per-week like the member
-- reply-reward's cap.
create or replace function public.book_club_submit_rating(p_cycle_id uuid, p_rating integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_host_user_id uuid;
  v_found boolean;
  v_is_host boolean;
  v_checkmark_count integer;
  v_has_clean_sweep boolean;
  v_reply_count integer;
  v_like_count integer;
  v_group_post_count integer;
  v_host_qualifies boolean;
  v_total_coins integer;
  v_release_id uuid;
  v_weekly_checkmark_coins constant integer := 10;
  v_clean_sweep_bonus_coins constant integer := 25;
  v_host_reward_coins constant integer := 250;
  v_host_min_replies constant integer := 3;
  v_host_min_likes constant integer := 5;
  v_host_min_group_posts constant integer := 2;
begin
  if v_uid is null or not public.bloom_circle_is_adult() or not public.book_club_feature_enabled() then
    raise exception 'not permitted';
  end if;
  if p_rating < 1 or p_rating > 5 then
    raise exception 'rating must be between 1 and 5';
  end if;
  if not public.book_club_is_participant(p_cycle_id) then
    raise exception 'not permitted';
  end if;

  select host_user_id, true into v_host_user_id, v_found
  from public.book_club_cycles where id = p_cycle_id and status = 'completed';
  if not coalesce(v_found, false) then
    raise exception 'this month has not closed yet';
  end if;
  v_is_host := v_host_user_id is not null and v_host_user_id = v_uid;

  insert into public.book_club_ratings (cycle_id, user_id, rating)
  values (p_cycle_id, v_uid, p_rating)
  on conflict (cycle_id, user_id) do update
    set rating = excluded.rating, updated_at = now();

  if v_is_host then
    select count(*) into v_reply_count
    from public.book_club_response_replies
    where cycle_id = p_cycle_id and author_id = v_uid;

    select count(*) into v_like_count
    from public.book_club_likes
    where cycle_id = p_cycle_id and user_id = v_uid;

    select count(*) into v_group_post_count
    from public.book_club_comments
    where cycle_id = p_cycle_id and week_number = 0 and author_id = v_uid;

    v_host_qualifies := v_reply_count >= v_host_min_replies
      and v_like_count >= v_host_min_likes
      and v_group_post_count >= v_host_min_group_posts;

    v_total_coins := case when v_host_qualifies then v_host_reward_coins else 0 end;
  else
    select count(*) into v_checkmark_count
    from public.book_club_weekly_checkmarks
    where cycle_id = p_cycle_id and user_id = v_uid;

    select exists (
      select 1 from public.book_club_clean_sweep_bonuses
      where cycle_id = p_cycle_id and user_id = v_uid
    ) into v_has_clean_sweep;

    v_total_coins := v_checkmark_count * v_weekly_checkmark_coins
      + (case when v_has_clean_sweep then v_clean_sweep_bonus_coins else 0 end);
  end if;

  insert into public.book_club_coin_releases (cycle_id, user_id, coins_released)
  values (p_cycle_id, v_uid, v_total_coins)
  on conflict (cycle_id, user_id) do nothing
  returning id into v_release_id;

  if v_release_id is not null and v_total_coins > 0 then
    perform public.increment_bloom_coins(v_uid, v_total_coins);
    insert into public.bloom_coin_ledger (user_id, delta, reason, metadata)
    values (
      v_uid, v_total_coins, 'book_club_month_release',
      jsonb_build_object('release_id', v_release_id, 'cycle_id', p_cycle_id, 'is_host', v_is_host)
    );
  end if;
end;
$$;
