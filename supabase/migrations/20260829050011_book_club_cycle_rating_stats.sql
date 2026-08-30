-- Book Club info-box star rating: aggregate-only (mirrors
-- book_club_cycle_completion_stats' shape), so individual ratings stay
-- private -- book_club_ratings itself is select-own-only. Unlike
-- completion_stats, this isn't restricted to completed cycles: it's shown
-- on the active-month card too (always 0 ratings there, which the UI reads
-- as "not yet reviewed" -- same tooltip a genuinely-unrated closed month
-- gets), not just closed-month summary cards.
create or replace function public.book_club_cycle_rating_stats(p_cycle_id uuid)
returns table (rating_count bigint, average_rating numeric)
language sql
stable
security definer
set search_path = public
as $$
  select count(*), avg(rating)::numeric
  from public.book_club_ratings
  where cycle_id = p_cycle_id
    and public.book_club_feature_enabled()
    and public.bloom_circle_is_adult()
    and exists (select 1 from public.book_club_cycles c where c.id = p_cycle_id);
$$;
