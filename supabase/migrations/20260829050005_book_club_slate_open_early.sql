-- Book Club next-month pipeline: book slate submissions move from the
-- (now-retired) slate_building phase to happening during host_pending
-- itself -- anyone opted into an upcoming cycle can submit a book option
-- any time before voting opens, so a slate already exists the instant a
-- host is selected at T-14d and voting can start immediately (per the
-- "open early slate submissions" decision).
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
    where c.id = cycle_id and c.status = 'host_pending'
  )
);
