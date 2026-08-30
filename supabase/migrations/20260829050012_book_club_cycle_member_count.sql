-- Book Club info box: member count needs to be visible to anyone browsing
-- /book-club, including people who haven't opted into the active cycle yet
-- -- but book_club_participants_select_cycle only lets non-participants see
-- an active cycle's row count via aggregate, not raw rows (row-level stays
-- opt-in-gated). Aggregate-only, no status restriction (works for the
-- active card as well as closed-month cards), mirroring
-- book_club_cycle_completion_stats' shape.
create or replace function public.book_club_cycle_member_count(p_cycle_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)
  from public.book_club_participants
  where cycle_id = p_cycle_id
    and public.book_club_feature_enabled()
    and public.bloom_circle_is_adult()
    and exists (select 1 from public.book_club_cycles c where c.id = p_cycle_id);
$$;
