-- Revert: chapters require explicit owner grant, no public read exception.

drop policy if exists "chapters_select_owner_or_granted" on public.manuscript_chapters;
create policy "chapters_select_owner_or_granted"
on public.manuscript_chapters for select
using (
  exists (
    select 1
    from public.manuscripts m
    where m.id = manuscript_chapters.manuscript_id
      and m.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.manuscript_access_grants g
    where g.manuscript_id = manuscript_chapters.manuscript_id
      and g.reader_id = auth.uid()
  )
);
