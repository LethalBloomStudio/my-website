-- Book Club Phase 5: weekly checkmarks and the coin-award mutex.
--
-- book_club_question_responses/check_ins carry cycle_id and week_number
-- directly (denormalized from question_id's own cycle/week) rather than
-- requiring every RLS check to join through
-- book_club_questionnaire_questions -- same pragmatic reasoning as most
-- other book_club_* tables carrying cycle_id even though it's technically
-- derivable through a chain.
--
-- book_club_current_week_number() computes "which week is it" from
-- cycle_starts_at, capped to the 1-5 range the schema already allows.
-- Plain SQL (not security definer): it only reads book_club_cycles, a
-- *different* table from whichever policy calls it, so -- like
-- book_club_is_participant() -- there's no self-reference recursion risk.
create or replace function public.book_club_current_week_number(p_cycle_id uuid)
returns integer
language sql
stable
set search_path = public
as $$
  select least(5, greatest(1,
    floor(extract(epoch from (now() - c.cycle_starts_at)) / (7 * 86400))::int + 1
  ))
  from public.book_club_cycles c
  where c.id = p_cycle_id and c.cycle_starts_at is not null;
$$;

-- No word_count CHECK here -- same reasoning as every other book_club text
-- field: RESPONSE_MIN_WORDS lives only in TS (form + API route), so it
-- stays a single trivially-adjustable constant, not a migration.
create table public.book_club_question_responses (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.book_club_questionnaire_questions(id) on delete cascade,
  cycle_id uuid not null references public.book_club_cycles(id) on delete cascade,
  week_number integer not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  word_count integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id, user_id)
);

alter table public.book_club_question_responses enable row level security;

-- Responses are shared discussion answers, not private journal entries --
-- once a week is unlocked, participants see everyone's response to it, not
-- just their own (own is always visible regardless, as a floor).
create policy book_club_question_responses_select
on public.book_club_question_responses
for select
using (
  public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and (
    user_id = auth.uid()
    or exists (
      select 1 from public.book_club_cycles c
      where c.id = cycle_id
        and c.cycle_starts_at is not null
        and now() >= c.cycle_starts_at + ((week_number - 1) * interval '7 days')
    )
  )
);

create policy book_club_question_responses_insert_own
on public.book_club_question_responses
for insert
with check (
  user_id = auth.uid()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id
      and c.cycle_starts_at is not null
      and now() >= c.cycle_starts_at + ((week_number - 1) * interval '7 days')
  )
);

-- No lock, ever -- same editing pattern as comments/questions.
create policy book_club_question_responses_update_own
on public.book_club_question_responses
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- The minimal "+1 of any kind" engagement action for someone who doesn't
-- want to comment. Only insertable for the actual current week (computed
-- server-side via book_club_current_week_number, not trusted from the
-- client) -- no backfilling a stale week just to farm a checkmark.
create table public.book_club_check_ins (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.book_club_cycles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_number integer not null,
  created_at timestamptz not null default now(),
  unique (cycle_id, user_id, week_number)
);

alter table public.book_club_check_ins enable row level security;

create policy book_club_check_ins_select_own
on public.book_club_check_ins
for select
using (auth.uid() = user_id);

create policy book_club_check_ins_insert_own
on public.book_club_check_ins
for insert
with check (
  user_id = auth.uid()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and week_number = public.book_club_current_week_number(cycle_id)
);

-- The atomic mutex: this unique constraint IS the concurrency guard (an
-- insert either wins it once, or is a silent on-conflict-do-nothing no-op).
-- No client INSERT policy at all -- only book_club_try_award_weekly_
-- checkmark() (below) writes here, same "privileged-writer-only" pattern
-- as book_club_cycles.
create table public.book_club_weekly_checkmarks (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.book_club_cycles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_number integer not null,
  earned_at timestamptz not null default now(),
  qualifying_actions jsonb not null default '{}'::jsonb,
  unique (cycle_id, user_id, week_number)
);

alter table public.book_club_weekly_checkmarks enable row level security;

create policy book_club_weekly_checkmarks_select_own
on public.book_club_weekly_checkmarks
for select
using (auth.uid() = user_id);

-- Checkmark = answered that week's question (word-count minimum already
-- enforced at submission time, so a response row existing is sufficient
-- proof here) + one more engagement action of any kind that week (a
-- check-in, or a comment posted in that week's date window). The
-- WEEKLY_CHECKMARK_COINS constant below is a placeholder per the plan --
-- easy single-line edit, not re-derived from anywhere else.
--
-- Reuses bloom_coin_ledger/increment_bloom_coins as-is (no new ledger
-- table), with a partial unique index as defense-in-depth mirroring the
-- birthday-coin pattern -- even if this function's own on-conflict-do-
-- nothing guard were somehow bypassed, a second ledger row for the same
-- checkmark_id still hits a unique-violation.
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
  v_checkmark_coins constant integer := 10; -- WEEKLY_CHECKMARK_COINS placeholder
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

create unique index bloom_coin_ledger_book_club_checkmark_unique
  on public.bloom_coin_ledger ((metadata ->> 'checkmark_id'))
  where reason = 'book_club_weekly_checkmark';

-- Extend the cycle engine with the checkmark safety-net sweep (step 4).
-- Primary path is event-driven -- the API routes for submitting a response,
-- checking in, and posting a comment each call
-- book_club_try_award_weekly_checkmark() directly right after their insert
-- -- this just catches anything missed (a failed client request after the
-- underlying insert succeeded, etc.), re-checking every already-started
-- week for every participant of the one live active cycle.
create or replace function public.advance_book_club_cycles()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cycle_row record;
  participant_row record;
  v_winner_user_id uuid;
  v_tied uuid[];
  v_current_week integer;
  v_week integer;
  v_slate_building_window constant interval := interval '48 hours';
  v_vote_window constant interval := interval '7 days';
  v_tiebreak_window constant interval := interval '48 hours';
  v_cycle_length constant interval := interval '28 days';
begin
  -- Step 1: grace expiry -> select host.
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

      insert into public.book_club_participants (cycle_id, user_id)
      values (cycle_row.id, v_winner_user_id)
      on conflict (cycle_id, user_id) do nothing;

      update public.book_club_cycles
      set host_user_id = v_winner_user_id,
          status = 'slate_building',
          slate_building_deadline = now() + v_slate_building_window,
          updated_at = now()
      where id = cycle_row.id;
    end if;
  end loop;

  -- Step 2: slate-building expiry -> open voting, or retry/abandon if empty.
  for cycle_row in
    select id, slate_extended from public.book_club_cycles
    where status = 'slate_building' and slate_building_deadline <= now()
  loop
    if exists (select 1 from public.book_club_book_options where cycle_id = cycle_row.id) then
      update public.book_club_cycles
      set status = 'voting',
          voting_opens_at = now(),
          voting_closes_at = now() + v_vote_window,
          updated_at = now()
      where id = cycle_row.id;
    elsif not cycle_row.slate_extended then
      update public.book_club_cycles
      set slate_extended = true,
          slate_building_deadline = now() + v_slate_building_window,
          updated_at = now()
      where id = cycle_row.id;
    else
      delete from public.book_club_host_signups where cycle_id = cycle_row.id;
      delete from public.book_club_participants where cycle_id = cycle_row.id;
      update public.book_club_cycles
      set status = 'host_pending',
          host_user_id = null,
          grace_window_deadline = null,
          slate_building_deadline = null,
          slate_extended = false,
          updated_at = now()
      where id = cycle_row.id;
    end if;
  end loop;

  -- Step 3: voting close -> pick winner, or flag/auto-resolve a tie.
  for cycle_row in
    select id, tie_pending, tie_break_deadline from public.book_club_cycles
    where status = 'voting'
      and voting_closes_at <= now()
      and (not tie_pending or tie_break_deadline <= now())
  loop
    v_tied := public.book_club_tied_options(cycle_row.id);

    if v_tied is null or array_length(v_tied, 1) = 0 then
      continue;
    elsif array_length(v_tied, 1) = 1 then
      update public.book_club_cycles
      set winning_book_option_id = v_tied[1],
          status = 'active',
          tie_pending = false,
          tie_break_deadline = null,
          cycle_starts_at = now(),
          cycle_ends_at = now() + v_cycle_length,
          updated_at = now()
      where id = cycle_row.id;
    elsif cycle_row.tie_pending then
      update public.book_club_cycles
      set winning_book_option_id = v_tied[1 + floor(random() * array_length(v_tied, 1))::int],
          status = 'active',
          tie_pending = false,
          tie_break_deadline = null,
          cycle_starts_at = now(),
          cycle_ends_at = now() + v_cycle_length,
          updated_at = now()
      where id = cycle_row.id;
    else
      update public.book_club_cycles
      set tie_pending = true,
          tie_break_deadline = now() + v_tiebreak_window,
          updated_at = now()
      where id = cycle_row.id;
    end if;
  end loop;

  -- Step 4: weekly checkmark safety-net sweep.
  for cycle_row in
    select id from public.book_club_cycles
    where status = 'active' and cycle_starts_at is not null
  loop
    v_current_week := public.book_club_current_week_number(cycle_row.id);
    if v_current_week is not null then
      for participant_row in
        select user_id from public.book_club_participants where cycle_id = cycle_row.id
      loop
        for v_week in 1..v_current_week loop
          perform public.book_club_try_award_weekly_checkmark(cycle_row.id, participant_row.user_id, v_week);
        end loop;
      end loop;
    end if;
  end loop;
end;
$$;
