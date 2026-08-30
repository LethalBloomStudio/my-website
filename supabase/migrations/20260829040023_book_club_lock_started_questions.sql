-- Book Club: once a week has commenced, the host can no longer change (or
-- late-create) that week's question. The UI already disables the editor
-- for started weeks, but that's cosmetic on its own -- this is the actual
-- enforcement, matching this project's pattern of RLS being the real
-- boundary and the UI just reflecting it.
--
-- "Commenced" = the same week-start math used everywhere else
-- (cycle_starts_at + (week_number-1)*7 days <= now()). A cycle that hasn't
-- gone active yet (cycle_starts_at is null) has no started weeks, so the
-- host can freely set up all weeks before launch, same as today.
drop policy if exists book_club_questionnaire_questions_insert_host on public.book_club_questionnaire_questions;
create policy book_club_questionnaire_questions_insert_host
on public.book_club_questionnaire_questions
for insert
with check (
  public.book_club_feature_enabled()
  and created_by = auth.uid()
  and public.bloom_circle_is_adult()
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id
      and c.host_user_id = auth.uid()
      and (c.cycle_starts_at is null or now() < c.cycle_starts_at + ((week_number - 1) * interval '7 days'))
  )
);

drop policy if exists book_club_questionnaire_questions_update_host on public.book_club_questionnaire_questions;
create policy book_club_questionnaire_questions_update_host
on public.book_club_questionnaire_questions
for update
using (
  public.book_club_feature_enabled()
  and created_by = auth.uid()
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id
      and c.host_user_id = auth.uid()
      and (c.cycle_starts_at is null or now() < c.cycle_starts_at + ((week_number - 1) * interval '7 days'))
  )
)
with check (
  public.book_club_feature_enabled()
  and created_by = auth.uid()
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id
      and c.host_user_id = auth.uid()
      and (c.cycle_starts_at is null or now() < c.cycle_starts_at + ((week_number - 1) * interval '7 days'))
  )
);
