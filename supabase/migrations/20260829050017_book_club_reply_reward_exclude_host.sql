-- Book Club: the host doesn't earn the reply-to-answer coin reward --
-- that's member-only. Unlike checkmark/clean-sweep coins (escrowed, so the
-- exclusion can happen later at release time in book_club_submit_rating),
-- reply coins pay out immediately, so the exclusion has to happen here, at
-- earn time. The host's reply *volume* still counts -- it's one of the
-- three minimums for their own 250-coin gate, tracked separately by
-- counting book_club_response_replies directly rather than this reward
-- table (which the host's replies never populate).
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
  v_reward_id uuid;
  v_reply_reward_coins constant integer := 2;
  v_weekly_cap constant integer := 5;
begin
  select * into v_reply from public.book_club_response_replies where id = p_reply_id;
  if v_reply is null or v_reply.word_count < 100 then
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
  on conflict (cycle_id, week_number, author_id, recipient_id) do nothing
  returning id into v_reward_id;

  if v_reward_id is not null then
    perform public.increment_bloom_coins(v_reply.author_id, v_reply_reward_coins);
    insert into public.bloom_coin_ledger (user_id, delta, reason, metadata)
    values (
      v_reply.author_id, v_reply_reward_coins, 'book_club_reply_reward',
      jsonb_build_object(
        'reward_id', v_reward_id, 'reply_id', p_reply_id, 'recipient_id', v_reply.recipient_id,
        'cycle_id', v_reply.cycle_id, 'week_number', v_reply.week_number
      )
    );
  end if;
end;
$$;
