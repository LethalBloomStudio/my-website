-- Restore public manuscript chapter reads.
-- Migration 20260308 removed the public visibility exception from the chapter
-- select policy. Public manuscripts should have their published chapters readable
-- by anyone (including anon) without needing an access grant.

drop policy if exists "chapters_select_owner_or_granted" on public.manuscript_chapters;
create policy "chapters_select_owner_or_granted"
on public.manuscript_chapters for select
using (
  -- Owner can always read all their chapters
  exists (
    select 1
    from public.manuscripts m
    where m.id = manuscript_chapters.manuscript_id
      and m.owner_id = auth.uid()
  )
  -- Granted beta readers
  or exists (
    select 1
    from public.manuscript_access_grants g
    where g.manuscript_id = manuscript_chapters.manuscript_id
      and g.reader_id = auth.uid()
  )
  -- Anyone (including anon) can read published chapters on public manuscripts
  or exists (
    select 1
    from public.manuscripts m
    where m.id = manuscript_chapters.manuscript_id
      and m.visibility = 'public'
      and manuscript_chapters.is_private = false
  )
);
