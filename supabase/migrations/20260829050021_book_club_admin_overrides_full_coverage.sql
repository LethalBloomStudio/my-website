-- Book Club admin: the override RPCs didn't cover everything an admin
-- might need to fix -- book_club_admin_change_book/book_club_admin_assign
-- had no cover_image_url param at all, and book_club_admin_change_questions
-- was custom-text-only (no preset picker, unlike the host's own
-- questionnaire editor). All three signatures change, so each old version
-- is dropped explicitly first -- CREATE OR REPLACE only replaces a
-- same-signature function; adding parameters (even with defaults) creates
-- a distinct overload instead of replacing, same lesson already learned
-- once this session with book_club_valid_parent_comment.

drop function if exists public.book_club_admin_change_book(uuid, text, text);
-- Full-replace semantics, matching title/author: whatever's passed becomes
-- the new value, including null-to-clear the cover.
create or replace function public.book_club_admin_change_book(
  p_cycle_id uuid, p_book_title text, p_book_author text, p_cover_image_url text default null
)
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
  set book_title = p_book_title, book_author = p_book_author, cover_image_url = p_cover_image_url
  where id = v_option_id;
end;
$$;

drop function if exists public.book_club_admin_assign(uuid, uuid, text, text);
create or replace function public.book_club_admin_assign(
  p_cycle_id uuid, p_host_user_id uuid, p_book_title text, p_book_author text, p_cover_image_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_next_slot integer;
  v_option_id uuid;
  v_cycle_length constant interval := interval '28 days';
begin
  if auth.uid() is not null then
    raise exception 'not permitted';
  end if;

  select status into v_status from public.book_club_cycles where id = p_cycle_id;
  if v_status is null or v_status = 'completed' then
    raise exception 'cycle not found or already completed';
  end if;

  select coalesce(max(slot_number), 0) + 1 into v_next_slot
  from public.book_club_book_options where cycle_id = p_cycle_id;

  insert into public.book_club_book_options (cycle_id, slot_number, submitted_by, book_title, book_author, cover_image_url)
  values (p_cycle_id, v_next_slot, p_host_user_id, p_book_title, p_book_author, p_cover_image_url)
  returning id into v_option_id;

  insert into public.book_club_host_stats (user_id, times_hosted, last_hosted_at)
  values (p_host_user_id, 1, now())
  on conflict (user_id) do update
    set times_hosted = book_club_host_stats.times_hosted + 1, last_hosted_at = now();

  insert into public.book_club_participants (cycle_id, user_id)
  values (p_cycle_id, p_host_user_id)
  on conflict (cycle_id, user_id) do nothing;

  update public.book_club_cycles
  set host_user_id = p_host_user_id,
      winning_book_option_id = v_option_id,
      status = 'active',
      tie_pending = false,
      tie_break_deadline = null,
      cycle_starts_at = now(),
      cycle_ends_at = now() + v_cycle_length,
      updated_at = now()
  where id = p_cycle_id;
end;
$$;

drop function if exists public.book_club_admin_change_questions(uuid, integer, text);
-- Now supports preset selection, same as the host's own editor -- when
-- p_source = 'preset', the prompt text is resolved server-side from
-- book_club_question_presets (never trusted from the client), matching
-- how /api/book-club/create-question resolves it for the host's own path.
create or replace function public.book_club_admin_change_questions(
  p_cycle_id uuid, p_week_number integer, p_source text, p_prompt text default null, p_preset_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host_user_id uuid;
  v_resolved_prompt text;
begin
  if auth.uid() is not null then
    raise exception 'not permitted';
  end if;
  if p_week_number < 1 or p_week_number > 5 then
    raise exception 'invalid week number';
  end if;
  if p_source not in ('custom', 'preset') then
    raise exception 'invalid source';
  end if;

  select host_user_id into v_host_user_id from public.book_club_cycles where id = p_cycle_id;
  if v_host_user_id is null then
    raise exception 'this cycle has no host yet';
  end if;

  if p_source = 'preset' then
    select prompt into v_resolved_prompt from public.book_club_question_presets where id = p_preset_id;
    if v_resolved_prompt is null then
      raise exception 'preset question not found';
    end if;
  else
    v_resolved_prompt := nullif(btrim(coalesce(p_prompt, '')), '');
    if v_resolved_prompt is null then
      raise exception 'a question prompt is required';
    end if;
  end if;

  insert into public.book_club_questionnaire_questions (cycle_id, week_number, prompt, source, preset_id, created_by)
  values (
    p_cycle_id, p_week_number, v_resolved_prompt, p_source,
    case when p_source = 'preset' then p_preset_id else null end,
    v_host_user_id
  )
  on conflict (cycle_id, week_number) do update
    set prompt = excluded.prompt, source = excluded.source, preset_id = excluded.preset_id;
end;
$$;
