-- Book Club: let any adult see the *decided* book for the landing summary,
-- without opening up the rest of the slate.
--
-- Once a cycle picks a winner, book_club_cycles.winning_book_option_id
-- points at it -- that row specifically is fine to show to any adult
-- (it's the public "this month's book" announcement), same reasoning as
-- why book_club_cycles itself is visible pre-opt-in. Every OTHER option in
-- that cycle's slate (runners-up, or the slate before voting closes) stays
-- participant-gated exactly as before -- this only widens access to the
-- one row that's actually been announced as the winner.
drop policy if exists book_club_book_options_select on public.book_club_book_options;
create policy book_club_book_options_select
on public.book_club_book_options
for select
using (
  public.book_club_feature_enabled()
  and public.bloom_circle_is_adult()
  and (
    public.book_club_is_participant(cycle_id)
    or exists (
      select 1 from public.book_club_cycles c
      where c.id = cycle_id and c.winning_book_option_id = book_club_book_options.id
    )
  )
);
