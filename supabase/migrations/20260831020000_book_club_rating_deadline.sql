-- Book Club: a closed cycle's coins were payable via book_club_submit_rating()
-- with no deadline at all -- a participant could rate (and collect) months
-- later. Per explicit instruction: participants get exactly 7 days after
-- the cycle closes (cycle_ends_at) to rate the book; after that, rating
-- still records (the score still counts toward the book's average --
-- there's no reason to block that), but the coin release is forfeited --
-- book_club_coin_releases still gets its row (coins_released = 0), so the
-- mutex still locks out any later claim rather than leaving it retryable.
create or replace function public.book_club_submit_rating(p_cycle_id uuid, p_rating integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_host_user_id uuid;
  v_cycle_ends_at timestamptz;
  v_found boolean;
  v_is_host boolean;
  v_checkmark_count integer;
  v_has_clean_sweep boolean;
  v_reply_reward_count integer;
  v_reply_count integer;
  v_like_count integer;
  v_group_post_count integer;
  v_question_count integer;
  v_host_qualifies boolean;
  v_total_coins integer;
  v_release_id uuid;
  v_weekly_checkmark_coins constant integer := 10;
  v_clean_sweep_bonus_coins constant integer := 25;
  v_reply_reward_coins constant integer := 2;
  v_host_reward_coins constant integer := 250;
  v_host_min_replies constant integer := 4;
  v_host_min_likes constant integer := 4;
  v_host_min_group_posts constant integer := 2;
  v_host_min_questions constant integer := 4;
  v_rating_window constant interval := interval '7 days';
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

  select host_user_id, cycle_ends_at, true into v_host_user_id, v_cycle_ends_at, v_found
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

    select count(distinct week_number) into v_question_count
    from public.book_club_questionnaire_questions
    where cycle_id = p_cycle_id and week_number between 1 and 4;

    v_host_qualifies := v_reply_count >= v_host_min_replies
      and v_like_count >= v_host_min_likes
      and v_group_post_count >= v_host_min_group_posts
      and v_question_count >= v_host_min_questions;

    v_total_coins := case when v_host_qualifies then v_host_reward_coins else 0 end;
  else
    select count(*) into v_checkmark_count
    from public.book_club_weekly_checkmarks
    where cycle_id = p_cycle_id and user_id = v_uid;

    select exists (
      select 1 from public.book_club_clean_sweep_bonuses
      where cycle_id = p_cycle_id and user_id = v_uid
    ) into v_has_clean_sweep;

    select count(*) into v_reply_reward_count
    from public.book_club_reply_rewards
    where cycle_id = p_cycle_id and author_id = v_uid;

    v_total_coins := v_checkmark_count * v_weekly_checkmark_coins
      + (case when v_has_clean_sweep then v_clean_sweep_bonus_coins else 0 end)
      + v_reply_reward_count * v_reply_reward_coins;
  end if;

  -- Forfeit if rating happens more than 7 days after the cycle closed --
  -- the rating itself was already recorded above regardless.
  if v_cycle_ends_at is not null and now() > v_cycle_ends_at + v_rating_window then
    v_total_coins := 0;
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
