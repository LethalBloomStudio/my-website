-- Book Club closing mechanics: once a month closes, its detail view
-- (discussion threads, responses, questionnaire) becomes permanently
-- inaccessible -- enforced here in RLS, not just by the page no longer
-- linking to it, per the "closed months are summary-card-only, for good"
-- requirement.
--
-- This is a deliberate reversal of three policies' original, documented
-- design ("stays readable once completed" -- book_club_comments', and the
-- equivalent implicit behavior on question_responses/questionnaire_questions,
-- which never excluded 'completed' at all). Product decision, not a bug fix.

-- book_club_comments: drop the completed carve-out entirely.
drop policy if exists book_club_comments_select on public.book_club_comments;
create policy book_club_comments_select
on public.book_club_comments
for select
using (
  public.book_club_feature_enabled()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id
      and c.status = 'active'
      and c.cycle_starts_at is not null
      and week_number <= public.book_club_current_week_number(cycle_id)
  )
);

-- book_club_question_responses: previously had no status check at all --
-- "week has started" stayed true forever once a cycle went active, so a
-- completed cycle's responses (including your own) stayed silently
-- readable. Now requires status = 'active' explicitly.
drop policy if exists book_club_question_responses_select on public.book_club_question_responses;
create policy book_club_question_responses_select
on public.book_club_question_responses
for select
using (
  public.book_club_feature_enabled()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id
      and c.status = 'active'
      and c.cycle_starts_at is not null
      and (
        user_id = auth.uid()
        or now() >= c.cycle_starts_at + ((week_number - 1) * interval '7 days')
      )
  )
);

-- book_club_questionnaire_questions: same gap as responses (host's
-- created_by = auth.uid() branch had no status check either), plus this
-- table now also needs to stay visible to the host during questions_pending
-- (the new final-week phase, before cycle_starts_at is set) so the
-- questionnaire editor keeps working there.
drop policy if exists book_club_questionnaire_questions_select on public.book_club_questionnaire_questions;
create policy book_club_questionnaire_questions_select
on public.book_club_questionnaire_questions
for select
using (
  public.book_club_feature_enabled()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id
      and (
        (c.status = 'questions_pending' and created_by = auth.uid())
        or (c.status = 'active' and (
          created_by = auth.uid()
          or (c.cycle_starts_at is not null and now() >= c.cycle_starts_at + ((week_number - 1) * interval '7 days'))
        ))
      )
  )
);
