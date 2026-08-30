-- Book Club: enforce the admin feature-flag toggle in RLS, not just the UI.
--
-- Until now, feature_flags only gated the Next.js page/nav (a signed-in
-- adult who knew the table names could still query book_club_* tables
-- directly via the Supabase client and see real data, or even opt in/vote/
-- comment, entirely bypassing the "admin turns it on" gate -- the RLS
-- itself never checked the flag). This closes that: admins always bypass
-- (same as the page-level check), everyone else needs the flag enabled.
--
-- Scope: every SELECT/INSERT/UPDATE policy gets the check added (uniform,
-- no per-table exceptions to remember). DELETE policies are left alone --
-- withdrawing your own signup/opt-in only shrinks your footprint, it's not
-- a new-exposure surface the toggle needs to guard.
create or replace function public.book_club_feature_enabled()
returns boolean
language sql
stable
set search_path = public
as $$
  select
    exists (select 1 from public.accounts where user_id = auth.uid() and is_admin = true)
    or coalesce((select is_enabled from public.feature_flags where name = 'book_club'), false);
$$;

-- book_club_cycles
drop policy if exists book_club_cycles_select on public.book_club_cycles;
create policy book_club_cycles_select
on public.book_club_cycles
for select
using (
  public.book_club_feature_enabled()
  and public.bloom_circle_is_adult()
  and (
    status <> 'completed'
    or host_user_id = auth.uid()
    or public.book_club_is_participant(id)
  )
);

-- book_club_host_stats
drop policy if exists book_club_host_stats_select_own on public.book_club_host_stats;
create policy book_club_host_stats_select_own
on public.book_club_host_stats
for select
using (public.book_club_feature_enabled() and auth.uid() = user_id);

-- book_club_host_signups (no client INSERT policy -- gated inside
-- book_club_join_host_signup() instead, since that function is the only
-- write path)
drop policy if exists book_club_host_signups_select_own on public.book_club_host_signups;
create policy book_club_host_signups_select_own
on public.book_club_host_signups
for select
using (public.book_club_feature_enabled() and auth.uid() = user_id);

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
  if v_uid is null or not public.bloom_circle_is_adult() or not public.book_club_feature_enabled() then
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

-- book_club_participants
drop policy if exists book_club_participants_select_own on public.book_club_participants;
create policy book_club_participants_select_own
on public.book_club_participants
for select
using (public.book_club_feature_enabled() and auth.uid() = user_id);

drop policy if exists book_club_participants_insert_own on public.book_club_participants;
create policy book_club_participants_insert_own
on public.book_club_participants
for insert
with check (
  public.book_club_feature_enabled()
  and auth.uid() = user_id
  and public.bloom_circle_is_adult()
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id and c.status <> 'completed'
  )
);

-- book_club_book_options
drop policy if exists book_club_book_options_select on public.book_club_book_options;
create policy book_club_book_options_select
on public.book_club_book_options
for select
using (public.book_club_feature_enabled() and public.bloom_circle_is_adult() and public.book_club_is_participant(cycle_id));

drop policy if exists book_club_book_options_insert on public.book_club_book_options;
create policy book_club_book_options_insert
on public.book_club_book_options
for insert
with check (
  public.book_club_feature_enabled()
  and submitted_by = auth.uid()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id and c.status = 'slate_building'
  )
);

-- book_club_book_votes
drop policy if exists book_club_book_votes_select_own on public.book_club_book_votes;
create policy book_club_book_votes_select_own
on public.book_club_book_votes
for select
using (public.book_club_feature_enabled() and auth.uid() = voter_id);

drop policy if exists book_club_book_votes_insert_own on public.book_club_book_votes;
create policy book_club_book_votes_insert_own
on public.book_club_book_votes
for insert
with check (
  public.book_club_feature_enabled()
  and voter_id = auth.uid()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id and c.status = 'voting' and now() < c.voting_closes_at
  )
);

drop policy if exists book_club_book_votes_update_own on public.book_club_book_votes;
create policy book_club_book_votes_update_own
on public.book_club_book_votes
for update
using (public.book_club_feature_enabled() and auth.uid() = voter_id)
with check (
  public.book_club_feature_enabled()
  and voter_id = auth.uid()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id and c.status = 'voting' and now() < c.voting_closes_at
  )
);

-- book_club_comments
drop policy if exists book_club_comments_select on public.book_club_comments;
create policy book_club_comments_select
on public.book_club_comments
for select
using (
  public.book_club_feature_enabled()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id and c.status in ('active', 'completed')
  )
);

drop policy if exists book_club_comments_insert on public.book_club_comments;
create policy book_club_comments_insert
on public.book_club_comments
for insert
with check (
  public.book_club_feature_enabled()
  and author_id = auth.uid()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id and c.status = 'active'
  )
  and public.book_club_valid_parent_comment(parent_comment_id, cycle_id)
);

drop policy if exists book_club_comments_update_own on public.book_club_comments;
create policy book_club_comments_update_own
on public.book_club_comments
for update
using (public.book_club_feature_enabled() and author_id = auth.uid() and public.bloom_circle_is_adult())
with check (public.book_club_feature_enabled() and author_id = auth.uid() and public.bloom_circle_is_adult());

-- book_club_question_presets
drop policy if exists book_club_question_presets_select_adult on public.book_club_question_presets;
create policy book_club_question_presets_select_adult
on public.book_club_question_presets
for select
using (public.book_club_feature_enabled() and public.bloom_circle_is_adult());

-- book_club_questionnaire_questions
drop policy if exists book_club_questionnaire_questions_select on public.book_club_questionnaire_questions;
create policy book_club_questionnaire_questions_select
on public.book_club_questionnaire_questions
for select
using (
  public.book_club_feature_enabled()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and (
    created_by = auth.uid()
    or exists (
      select 1 from public.book_club_cycles c
      where c.id = cycle_id
        and c.cycle_starts_at is not null
        and now() >= c.cycle_starts_at + ((week_number - 1) * interval '7 days')
    )
  )
);

drop policy if exists book_club_questionnaire_questions_insert_host on public.book_club_questionnaire_questions;
create policy book_club_questionnaire_questions_insert_host
on public.book_club_questionnaire_questions
for insert
with check (
  public.book_club_feature_enabled()
  and created_by = auth.uid()
  and public.bloom_circle_is_adult()
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id and c.host_user_id = auth.uid()
  )
);

drop policy if exists book_club_questionnaire_questions_update_host on public.book_club_questionnaire_questions;
create policy book_club_questionnaire_questions_update_host
on public.book_club_questionnaire_questions
for update
using (
  public.book_club_feature_enabled()
  and created_by = auth.uid()
  and exists (select 1 from public.book_club_cycles c where c.id = cycle_id and c.host_user_id = auth.uid())
)
with check (
  public.book_club_feature_enabled()
  and created_by = auth.uid()
  and exists (select 1 from public.book_club_cycles c where c.id = cycle_id and c.host_user_id = auth.uid())
);

-- book_club_question_responses
drop policy if exists book_club_question_responses_select on public.book_club_question_responses;
create policy book_club_question_responses_select
on public.book_club_question_responses
for select
using (
  public.book_club_feature_enabled()
  and public.bloom_circle_is_adult()
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

drop policy if exists book_club_question_responses_insert_own on public.book_club_question_responses;
create policy book_club_question_responses_insert_own
on public.book_club_question_responses
for insert
with check (
  public.book_club_feature_enabled()
  and user_id = auth.uid()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id
      and c.cycle_starts_at is not null
      and now() >= c.cycle_starts_at + ((week_number - 1) * interval '7 days')
  )
);

drop policy if exists book_club_question_responses_update_own on public.book_club_question_responses;
create policy book_club_question_responses_update_own
on public.book_club_question_responses
for update
using (public.book_club_feature_enabled() and user_id = auth.uid())
with check (public.book_club_feature_enabled() and user_id = auth.uid());

-- book_club_check_ins
drop policy if exists book_club_check_ins_select_own on public.book_club_check_ins;
create policy book_club_check_ins_select_own
on public.book_club_check_ins
for select
using (public.book_club_feature_enabled() and auth.uid() = user_id);

drop policy if exists book_club_check_ins_insert_own on public.book_club_check_ins;
create policy book_club_check_ins_insert_own
on public.book_club_check_ins
for insert
with check (
  public.book_club_feature_enabled()
  and user_id = auth.uid()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and week_number = public.book_club_current_week_number(cycle_id)
);

-- book_club_weekly_checkmarks
drop policy if exists book_club_weekly_checkmarks_select_own on public.book_club_weekly_checkmarks;
create policy book_club_weekly_checkmarks_select_own
on public.book_club_weekly_checkmarks
for select
using (public.book_club_feature_enabled() and auth.uid() = user_id);

-- book_club_clean_sweep_bonuses
drop policy if exists book_club_clean_sweep_bonuses_select_own on public.book_club_clean_sweep_bonuses;
create policy book_club_clean_sweep_bonuses_select_own
on public.book_club_clean_sweep_bonuses
for select
using (public.book_club_feature_enabled() and auth.uid() = user_id);

-- book_club_vote_tally() / book_club_my_tied_options() are SECURITY
-- DEFINER and callable directly by end users via supabase.rpc(). Their
-- existing permission check (book_club_is_participant()) runs inside that
-- elevated context, where the definer's role may bypass RLS entirely --
-- meaning the flag-gated policy on book_club_participants might not
-- actually block a stale/grandfathered participant here the way it does
-- everywhere else. Adding the flag check explicitly, rather than relying
-- on it being enforced transitively through RLS, closes that.
create or replace function public.book_club_vote_tally(p_cycle_id uuid)
returns table (book_option_id uuid, vote_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.book_club_feature_enabled() or not public.book_club_is_participant(p_cycle_id) then
    raise exception 'not permitted';
  end if;

  return query
    select v.book_option_id, count(*)
    from public.book_club_book_votes v
    where v.cycle_id = p_cycle_id
    group by v.book_option_id;
end;
$$;

create or replace function public.book_club_my_tied_options(p_cycle_id uuid)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.book_club_feature_enabled() or not public.book_club_is_participant(p_cycle_id) then
    raise exception 'not permitted';
  end if;
  return public.book_club_tied_options(p_cycle_id);
end;
$$;
