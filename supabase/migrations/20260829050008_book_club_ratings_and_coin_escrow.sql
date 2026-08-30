-- Book Club closing mechanics: end-of-month rating gates that
-- participant's own Bloom Coin payout for the month -- doesn't affect
-- anyone else's. Weekly-checkmark and clean-sweep-bonus coins stop being
-- paid at earn-time (this migration removes that from
-- book_club_try_award_weekly_checkmark(); advance_book_club_cycles()'s
-- step 5 already only records clean-sweep *eligibility*, as of
-- 20260829050004) and instead sit unpaid until book_club_submit_rating()
-- releases the whole month's earned total in one shot.
--
-- book_club_ratings has no client INSERT/UPDATE policy -- same
-- privileged-writer-only shape as book_club_weekly_checkmarks/
-- clean_sweep_bonuses, since submitting a rating has the coin-release side
-- effect and needs to go through the RPC to stay atomic.
create table public.book_club_ratings (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.book_club_cycles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, user_id)
);

alter table public.book_club_ratings enable row level security;

create policy book_club_ratings_select_own
on public.book_club_ratings
for select
using (auth.uid() = user_id);

-- Mutex table: the unique constraint on (cycle_id, user_id) is the
-- concurrency guard and the "have we already released this person's coins
-- for this month" flag, same shape as book_club_weekly_checkmarks/
-- clean_sweep_bonuses. No client write policy -- only
-- book_club_submit_rating() writes here.
create table public.book_club_coin_releases (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.book_club_cycles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  released_at timestamptz not null default now(),
  coins_released integer not null,
  unique (cycle_id, user_id)
);

alter table public.book_club_coin_releases enable row level security;

create policy book_club_coin_releases_select_own
on public.book_club_coin_releases
for select
using (auth.uid() = user_id);

create unique index bloom_coin_ledger_book_club_month_release_unique
  on public.bloom_coin_ledger ((metadata ->> 'release_id'))
  where reason = 'book_club_month_release';

-- Records the rating, then releases that participant's whole month's
-- escrowed total (checkmark coins + clean-sweep bonus if earned) exactly
-- once, gated by book_club_coin_releases' unique constraint -- re-rating
-- (changing your stars later) updates the rating but never re-releases.
-- WEEKLY_CHECKMARK_COINS/CLEAN_SWEEP_BONUS_COINS values duplicated here
-- (10, 25) rather than shared, matching this project's established
-- adjustable-constant style for these placeholders.
create or replace function public.book_club_submit_rating(p_cycle_id uuid, p_rating integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_checkmark_count integer;
  v_has_clean_sweep boolean;
  v_total_coins integer;
  v_release_id uuid;
  v_weekly_checkmark_coins constant integer := 10;
  v_clean_sweep_bonus_coins constant integer := 25;
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
  if not exists (select 1 from public.book_club_cycles where id = p_cycle_id and status = 'completed') then
    raise exception 'this month has not closed yet';
  end if;

  insert into public.book_club_ratings (cycle_id, user_id, rating)
  values (p_cycle_id, v_uid, p_rating)
  on conflict (cycle_id, user_id) do update
    set rating = excluded.rating, updated_at = now();

  select count(*) into v_checkmark_count
  from public.book_club_weekly_checkmarks
  where cycle_id = p_cycle_id and user_id = v_uid;

  select exists (
    select 1 from public.book_club_clean_sweep_bonuses
    where cycle_id = p_cycle_id and user_id = v_uid
  ) into v_has_clean_sweep;

  v_total_coins := v_checkmark_count * v_weekly_checkmark_coins
    + (case when v_has_clean_sweep then v_clean_sweep_bonus_coins else 0 end);

  insert into public.book_club_coin_releases (cycle_id, user_id, coins_released)
  values (p_cycle_id, v_uid, v_total_coins)
  on conflict (cycle_id, user_id) do nothing
  returning id into v_release_id;

  if v_release_id is not null and v_total_coins > 0 then
    perform public.increment_bloom_coins(v_uid, v_total_coins);
    insert into public.bloom_coin_ledger (user_id, delta, reason, metadata)
    values (
      v_uid, v_total_coins, 'book_club_month_release',
      jsonb_build_object(
        'release_id', v_release_id, 'cycle_id', p_cycle_id,
        'checkmark_count', v_checkmark_count, 'clean_sweep', v_has_clean_sweep
      )
    );
  end if;
end;
$$;

-- book_club_try_award_weekly_checkmark(): drops the immediate payout,
-- keeps recording the checkmark itself (still needed -- it's both the
-- "did you earn it" record book_club_submit_rating() reads and what
-- BookClubWeeklyProgress displays during the month).
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
begin
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
  on conflict (cycle_id, user_id, week_number) do nothing;
end;
$$;
