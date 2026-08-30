-- Book Club: reply-to-answer reward mechanic. Deliberately a new table,
-- not a repurposed book_club_comments -- that table's parent_comment_id
-- model is "2-level threading under a top-level comment within one week's
-- general thread," a different anchor than "reply to a specific person's
-- response row," and retrofitting it risks tangling the new graded
-- mechanic into the general-chat RLS surface. What IS reused, per the
-- audit, is the atomic/anti-duplicate award pattern already established by
-- book_club_weekly_checkmarks/clean_sweep_bonuses/coin_releases: a mutex
-- table whose unique constraint is both the "already paid" flag and the
-- concurrency guard.
--
-- Immutable once posted (no update/delete policy) -- unlike comments,
-- which allow free editing, letting a reply be edited after the fact would
-- open a gaming path (submit short, get evaluated as non-qualifying, edit
-- up to 100+ words without re-triggering evaluation).
create table public.book_club_response_replies (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.book_club_question_responses(id) on delete cascade,
  cycle_id uuid not null references public.book_club_cycles(id) on delete cascade,
  week_number integer not null,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  word_count integer not null,
  created_at timestamptz not null default now(),
  check (author_id <> recipient_id)
);

create index book_club_response_replies_response_idx
  on public.book_club_response_replies (response_id, created_at);

alter table public.book_club_response_replies enable row level security;

-- Same visibility as the response feed itself -- a closed (past) week's
-- responses stay viewable read-only, so replies to them do too. Only new
-- writes are current-week-gated (below).
create policy book_club_response_replies_select
on public.book_club_response_replies
for select
using (
  public.book_club_feature_enabled()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id
      and c.status = 'active'
      and c.cycle_starts_at is not null
      and now() >= c.cycle_starts_at + ((week_number - 1) * interval '7 days')
  )
);

-- The trailing EXISTS ties response_id/cycle_id/week_number/recipient_id
-- together server-side -- a client can't claim a reply belongs to a
-- different response/week/recipient than the response row actually says.
create policy book_club_response_replies_insert
on public.book_club_response_replies
for insert
with check (
  public.book_club_feature_enabled()
  and author_id = auth.uid()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id
      and c.status = 'active'
      and week_number = public.book_club_current_week_number(cycle_id)
  )
  and exists (
    select 1 from public.book_club_question_responses r
    where r.id = response_id
      and r.cycle_id = book_club_response_replies.cycle_id
      and r.week_number = book_club_response_replies.week_number
      and r.user_id = book_club_response_replies.recipient_id
  )
);

-- Mutex: unique (cycle_id, week_number, author_id, recipient_id) is both
-- "has this pair already paid out this week" and the concurrency guard --
-- same shape as every other award table in Book Club. No client write
-- policy -- only book_club_try_award_reply_reward() writes here.
create table public.book_club_reply_rewards (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.book_club_cycles(id) on delete cascade,
  week_number integer not null,
  author_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  reply_id uuid not null references public.book_club_response_replies(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  unique (cycle_id, week_number, author_id, recipient_id)
);

alter table public.book_club_reply_rewards enable row level security;

create policy book_club_reply_rewards_select_own
on public.book_club_reply_rewards
for select
using (auth.uid() = author_id);

create unique index bloom_coin_ledger_book_club_reply_reward_unique
  on public.bloom_coin_ledger ((metadata ->> 'reward_id'))
  where reason = 'book_club_reply_reward';

-- Called right after a reply insert. word_count < 100 is a silent no-op
-- (the reply still posts either way -- REPLY_MIN_WORDS_TO_QUALIFY gates
-- the reward only, not the ability to post, matching how ordinary
-- comments have never had a minimum). The weekly cap
-- (REPLY_WEEKLY_CAP = 5 unique recipients = 10 coins) is a plain
-- count-then-insert check, not row-locked -- same rigor level as every
-- other award function in this file, none of which lock either; a
-- pathological concurrent-request race could in theory let the count run
-- one over, which is an acceptable risk at this scale. No internal
-- auth.uid() check on the caller, matching
-- book_club_try_award_weekly_checkmark()'s existing precedent -- the
-- function only ever pays the reply's *actual* author real, already-earned
-- coins, so an out-of-turn call is a no-op at worst, not exploitable.
create or replace function public.book_club_try_award_reply_reward(p_reply_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reply record;
  v_award_count integer;
  v_reward_id uuid;
  v_reply_reward_coins constant integer := 2;
  v_weekly_cap constant integer := 5;
begin
  select * into v_reply from public.book_club_response_replies where id = p_reply_id;
  if v_reply is null or v_reply.word_count < 100 then
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
