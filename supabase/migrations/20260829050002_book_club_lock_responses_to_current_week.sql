-- Book Club month view: "once a week closes, no new responses" wasn't
-- actually enforced -- book_club_question_responses_insert_own only
-- required the week to have *started* (now() past its 7-day window start),
-- with no upper bound, so a participant could still submit or upsert an
-- answer to week 1's question after week 3 had begun. Tightened to require
-- the week being written to is the current one.
--
-- This deliberately overrides update_own's originally-documented "no lock,
-- ever" stance (comments/questions keep that stance -- editing a typo in
-- an old comment is harmless). A response is different: submit-response's
-- upsert is how an answer is filed in the first place, so leaving update
-- unlocked would let someone "edit" a closed week's empty response into a
-- brand-new late answer, defeating the close entirely.
drop policy if exists book_club_question_responses_insert_own on public.book_club_question_responses;
create policy book_club_question_responses_insert_own
on public.book_club_question_responses
for insert
with check (
  public.book_club_feature_enabled()
  and user_id = auth.uid()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and week_number = public.book_club_current_week_number(cycle_id)
);

drop policy if exists book_club_question_responses_update_own on public.book_club_question_responses;
create policy book_club_question_responses_update_own
on public.book_club_question_responses
for update
using (public.book_club_feature_enabled() and user_id = auth.uid())
with check (
  public.book_club_feature_enabled()
  and user_id = auth.uid()
  and week_number = public.book_club_current_week_number(cycle_id)
);
