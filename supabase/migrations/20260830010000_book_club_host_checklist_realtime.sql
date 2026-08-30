-- Book Club: BookClubHostChecklist subscribes to postgres_changes on these
-- four tables, but none of them were ever added to the supabase_realtime
-- publication -- that's a separate per-table opt-in from RLS, and every
-- other realtime consumer in this codebase (manuscripts, line_feedback,
-- system_notifications) has an explicit "alter publication ... add table"
-- migration for it. Without this, postgres_changes silently never fires
-- for these tables -- no error, the checklist just never updates. This is
-- the real fix for "group thoughts posts and likes aren't updating live."
--
-- Also sets REPLICA IDENTITY FULL on all four -- DEFAULT (primary key
-- only) means a DELETE event's "old record" only carries the row's id,
-- which can't satisfy the checklist's cycle_id=eq.<cycleId> realtime
-- filter. Needed specifically so "delete a like / delete a question"
-- still triggers the checklist's live re-check and un-checks the item,
-- not just inserts.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'book_club_comments'
  ) then
    alter publication supabase_realtime add table public.book_club_comments;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'book_club_likes'
  ) then
    alter publication supabase_realtime add table public.book_club_likes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'book_club_response_replies'
  ) then
    alter publication supabase_realtime add table public.book_club_response_replies;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'book_club_questionnaire_questions'
  ) then
    alter publication supabase_realtime add table public.book_club_questionnaire_questions;
  end if;
end $$;

alter table public.book_club_comments replica identity full;
alter table public.book_club_likes replica identity full;
alter table public.book_club_response_replies replica identity full;
alter table public.book_club_questionnaire_questions replica identity full;
