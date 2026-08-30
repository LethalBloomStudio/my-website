-- Book Club: nothing ever stopped a user (host included) from liking
-- their own response, reply, or comment -- book_club_likes_insert never
-- compared the target's author against auth.uid(). Adding that check to
-- each of the three EXISTS branches, same defensive-EXISTS shape the
-- policy already used to tie each target back to cycle_id.

drop policy if exists book_club_likes_insert on public.book_club_likes;
create policy book_club_likes_insert
on public.book_club_likes
for insert
with check (
  public.book_club_feature_enabled()
  and user_id = auth.uid()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and exists (select 1 from public.book_club_cycles c where c.id = cycle_id and c.status = 'active')
  and (
    (response_id is not null and exists (
      select 1 from public.book_club_question_responses r
      where r.id = response_id and r.cycle_id = book_club_likes.cycle_id and r.user_id <> auth.uid()
    ))
    or (reply_id is not null and exists (
      select 1 from public.book_club_response_replies rr
      where rr.id = reply_id and rr.cycle_id = book_club_likes.cycle_id and rr.author_id <> auth.uid()
    ))
    or (comment_id is not null and exists (
      select 1 from public.book_club_comments c2
      where c2.id = comment_id and c2.cycle_id = book_club_likes.cycle_id and c2.author_id <> auth.uid()
    ))
  )
);
