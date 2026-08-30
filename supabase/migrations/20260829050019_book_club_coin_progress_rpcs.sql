-- Book Club: two read-only aggregates for the "coins earned so far this
-- cycle" display at the top of the month view. Member view gets a running
-- coin total; the host view (a coin total would just read "0" for them,
-- accurately but uselessly, since they don't earn these) gets progress
-- toward their own three thresholds instead.

-- Checkmark + reply-reward + clean-sweep coins earned so far this cycle,
-- regardless of whether they've actually been released yet (rating is what
-- releases them -- this is a preview of what rating will pay out, not a
-- claim they're already in the spendable balance).
create or replace function public.book_club_my_cycle_coin_progress(p_cycle_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select count(*) from public.book_club_weekly_checkmarks where cycle_id = p_cycle_id and user_id = auth.uid()), 0) * 10
    + coalesce((select count(*) from public.book_club_reply_rewards where cycle_id = p_cycle_id and author_id = auth.uid()), 0) * 2
    + case when exists (select 1 from public.book_club_clean_sweep_bonuses where cycle_id = p_cycle_id and user_id = auth.uid()) then 25 else 0 end
  where auth.uid() is not null
    and public.book_club_feature_enabled()
    and public.bloom_circle_is_adult()
    and public.book_club_is_participant(p_cycle_id);
$$;

-- Only returns a row for the cycle's actual host -- meaningless for anyone
-- else. Thresholds are returned alongside the counts (rather than hardcoded
-- client-side a second time) so the UI never has to duplicate 3/5/2.
create or replace function public.book_club_host_reward_progress(p_cycle_id uuid)
returns table (
  reply_count bigint, like_count bigint, group_post_count bigint,
  replies_needed integer, likes_needed integer, group_posts_needed integer,
  already_released boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.book_club_response_replies where cycle_id = p_cycle_id and author_id = auth.uid()),
    (select count(*) from public.book_club_likes where cycle_id = p_cycle_id and user_id = auth.uid()),
    (select count(*) from public.book_club_comments where cycle_id = p_cycle_id and week_number = 0 and author_id = auth.uid()),
    3, 5, 2,
    exists (select 1 from public.book_club_coin_releases where cycle_id = p_cycle_id and user_id = auth.uid())
  where auth.uid() is not null
    and public.book_club_feature_enabled()
    and public.bloom_circle_is_adult()
    and exists (select 1 from public.book_club_cycles c where c.id = p_cycle_id and c.host_user_id = auth.uid());
$$;
