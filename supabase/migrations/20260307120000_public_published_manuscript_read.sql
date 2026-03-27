-- Allow everyone (including anon) to read published manuscripts and published chapters.
-- Draft manuscripts and draft chapters remain private to owners/granted readers.

drop policy if exists manuscripts_select_owner on public.manuscripts;
create policy manuscripts_select_owner
on public.manuscripts
for select
using (
  auth.uid() = owner_id
  or visibility = 'public'
);

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
  or exists (
    select 1
    from public.manuscripts m
    where m.id = manuscript_chapters.manuscript_id
      and m.visibility = 'public'
      and manuscript_chapters.is_private = false
  )
);
