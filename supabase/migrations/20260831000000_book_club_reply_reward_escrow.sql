-- Book Club: reply-to-answer coins move from immediate payout into the
-- same escrow-until-rating model as checkmark/clean-sweep coins --
-- explicit user decision. Unchanged in scope (still only
-- book_club_response_replies, i.e. replies to a weekly answer -- this
-- never touched book_club_comments/Group Thoughts and still doesn't) and
-- unchanged in shape (2 coins/reply, first-qualifying-reply-per-recipient-
-- per-week only, capped at 5 unique recipients/10 coins per person per
-- week) -- only the *timing* of payout changes.
--
-- Also fixes a real bug: the client/API word-count threshold for this
-- reward was lowered 100 -> 50 in an earlier session today, but this
-- RPC's own hardcoded "word_count < 100" gate was missed, so any reply of
-- 50-99 words was told "you qualified" while the database silently never
-- paid it. Fixed in the same pass since it's the same threshold.

-- BookClubMemberChecklist (new this session) subscribes to postgres_changes
-- on book_club_reply_rewards to show live "replies to others this week"
-- progress -- same gotcha as the host checklist earlier this session:
-- realtime needs an explicit per-table publication grant separate from
-- RLS, and this table was never added. Also REPLICA IDENTITY FULL so a
-- DELETE (if a reward row is ever removed) carries enough data to match
-- the checklist's cycle_id filter.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'book_club_reply_rewards'
  ) then
    alter publication supabase_realtime add table public.book_club_reply_rewards;
  end if;
end $$;
alter table public.book_club_reply_rewards replica identity full;

-- One-time reconciliation: every book_club_reply_rewards row that exists
-- right now was paid immediately under the old code. This feature (and
-- book_club_reply_rewards itself) launched today, and a cycle needs 28
-- real days to reach cycle_ends_at, so no cycle can possibly be
-- 'completed' yet -- every existing row is guaranteed to belong to a
-- still-active cycle. Safe to claw back the already-paid coins here;
-- book_club_submit_rating() will correctly re-grant them once the member
-- actually rates. Guarded by status <> 'completed' anyway, defensively,
-- even though it can't currently fire.
do $$
declare
  r record;
begin
  for r in
    select rr.author_id, rr.id
    from public.book_club_reply_rewards rr
    join public.book_club_cycles c on c.id = rr.cycle_id
    where c.status <> 'completed'
  loop
    perform public.increment_bloom_coins(r.author_id, -2);
    insert into public.bloom_coin_ledger (user_id, delta, reason, metadata)
    values (r.author_id, -2, 'book_club_reply_reward_escrow_migration', jsonb_build_object('reward_id', r.id));
  end loop;
end $$;

-- No longer pays immediately -- just records eligibility (the same
-- insert-with-on-conflict-do-nothing mutex as before), released alongside
-- checkmark/clean-sweep coins by book_club_submit_rating() below.
create or replace function public.book_club_try_award_reply_reward(p_reply_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reply record;
  v_host_user_id uuid;
  v_award_count integer;
  v_weekly_cap constant integer := 5;
begin
  select * into v_reply from public.book_club_response_replies where id = p_reply_id;
  if v_reply is null or v_reply.word_count < 50 then
    return;
  end if;

  select host_user_id into v_host_user_id from public.book_club_cycles where id = v_reply.cycle_id;
  if v_host_user_id is not null and v_host_user_id = v_reply.author_id then
    return;
  end if;

  select count(*) into v_award_count
  from public.book_club_reply_rewards
  where cycle_id = v_reply.cycle_id and week_number = v_reply.week_number and author_id = v_reply.author_id;

  if v_award_count >= v_weekly_cap then
    return;
  end if;

  insert into public.book_club_reply_rewards (cycle_id, week_number, author_id, recipient_id, reply_id)
  values (v_reply.cycle_id, v_reply.week_number, v_reply.author_id, v_reply.recipient_id, p_reply_id)
  on conflict (cycle_id, week_number, author_id, recipient_id) do nothing;
end;
$$;

-- Adds reply-reward coins (2 each, already capped at earn-time so a plain
-- count here is safe) into the member payout, alongside checkmark and
-- clean-sweep coins. Host branch untouched -- the host never populates
-- book_club_reply_rewards at all (excluded at earn-time above), their
-- reply volume is tracked separately via a direct
-- book_club_response_replies count for their own 250-coin gate.
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
