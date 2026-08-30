-- Book Club: the weekly checkmark drops its "+1 additional action" leg
-- (a check-in or a comment within that week's date window) -- earning it
-- is now solely "did you answer this week's question." book_club_check_ins
-- (table, BookClubCheckInButton, /api/book-club/check-in) is left in place,
-- fully dormant -- nothing reads it anymore, but it costs nothing to keep
-- and is trivially reversible if this comes back later.
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
  v_answered boolean;
begin
  select cycle_starts_at into v_cycle_starts_at from public.book_club_cycles where id = p_cycle_id;
  if v_cycle_starts_at is null then
    return;
  end if;

  select exists (
    select 1 from public.book_club_question_responses r
    where r.cycle_id = p_cycle_id and r.week_number = p_week_number and r.user_id = p_user_id
  ) into v_answered;

  if not v_answered then
    return;
  end if;

  insert into public.book_club_weekly_checkmarks (cycle_id, user_id, week_number, qualifying_actions)
  values (p_cycle_id, p_user_id, p_week_number, jsonb_build_object('answered_question', true))
  on conflict (cycle_id, user_id, week_number) do nothing;
end;
$$;
