-- Book Club admin override expansion: change host/book/questions on any
-- cycle, not just the one-time bootstrap assign. Same "only callable with
-- no end-user session" gating as book_club_admin_assign()/
-- book_club_admin_delete_cycle() -- only reachable through the admin API
-- route's service-role client, which has already verified is_admin.

-- Reassigns the host. Adjusts times_hosted for both the outgoing and
-- incoming host (decrement/increment) so the least-times-hosted selection
-- algorithm doesn't drift from admin corrections -- unlike
-- book_club_admin_delete_cycle's coin non-clawback, this one IS reconciled,
-- per explicit instruction. Ensures the new host is a participant (same as
-- the normal selection path); does not remove the old host as a
-- participant -- they may still want to follow along.
create or replace function public.book_club_admin_change_host(p_cycle_id uuid, p_new_host_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_host_user_id uuid;
  v_found boolean;
begin
  if auth.uid() is not null then
    raise exception 'not permitted';
  end if;

  select host_user_id, true into v_old_host_user_id, v_found from public.book_club_cycles where id = p_cycle_id;
  if not coalesce(v_found, false) then
    raise exception 'cycle not found';
  end if;

  if v_old_host_user_id is not null and v_old_host_user_id <> p_new_host_user_id then
    update public.book_club_host_stats
    set times_hosted = greatest(0, times_hosted - 1)
    where user_id = v_old_host_user_id;
  end if;

  insert into public.book_club_host_stats (user_id, times_hosted, last_hosted_at)
  values (p_new_host_user_id, 1, now())
  on conflict (user_id) do update
    set times_hosted = book_club_host_stats.times_hosted + 1,
        last_hosted_at = now();

  insert into public.book_club_participants (cycle_id, user_id)
  values (p_cycle_id, p_new_host_user_id)
  on conflict (cycle_id, user_id) do nothing;

  update public.book_club_cycles
  set host_user_id = p_new_host_user_id, updated_at = now()
  where id = p_cycle_id;
end;
$$;

-- Edits the *decided* book's title/author in place. Only meaningful once a
-- winner exists (questions_pending/active/completed) -- a cycle still
-- host_pending/voting has no winning_book_option_id to edit, and forcing a
-- book onto one of those is what book_club_admin_assign() already covers,
-- so this intentionally does not attempt that.
create or replace function public.book_club_admin_change_book(p_cycle_id uuid, p_book_title text, p_book_author text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_option_id uuid;
begin
  if auth.uid() is not null then
    raise exception 'not permitted';
  end if;

  select winning_book_option_id into v_option_id from public.book_club_cycles where id = p_cycle_id;
  if v_option_id is null then
    raise exception 'this cycle has no decided book yet -- use book_club_admin_assign for that';
  end if;

  update public.book_club_book_options
  set book_title = p_book_title, book_author = p_book_author
  where id = v_option_id;
end;
$$;

-- Upserts a week's question bypassing the host-only created_by check.
-- created_by is still set to the cycle's actual host (not the admin) --
-- that's what keeps it visible to that host under
-- book_club_questionnaire_questions_select's own-preview branch during
-- questions_pending, and preserves "who this cycle's questions belong to"
-- semantics. Requires the cycle to already have a host (same reasoning as
-- change_book -- nothing sensible to attribute an override to otherwise).
create or replace function public.book_club_admin_change_questions(p_cycle_id uuid, p_week_number integer, p_prompt text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host_user_id uuid;
begin
  if auth.uid() is not null then
    raise exception 'not permitted';
  end if;
  if p_week_number < 1 or p_week_number > 5 then
    raise exception 'invalid week number';
  end if;

  select host_user_id into v_host_user_id from public.book_club_cycles where id = p_cycle_id;
  if v_host_user_id is null then
    raise exception 'this cycle has no host yet';
  end if;

  insert into public.book_club_questionnaire_questions (cycle_id, week_number, prompt, source, preset_id, created_by)
  values (p_cycle_id, p_week_number, p_prompt, 'custom', null, v_host_user_id)
  on conflict (cycle_id, week_number) do update
    set prompt = excluded.prompt, source = 'custom', preset_id = null;
end;
$$;
