-- Fix manuscript create/edit/select permissions and cover-upload storage policies.
-- Run in Supabase SQL editor.

-- 1) Manuscript table policies
alter table public.manuscripts enable row level security;

drop policy if exists manuscripts_select_owner on public.manuscripts;
create policy manuscripts_select_owner
on public.manuscripts
for select
using (
  auth.uid() = owner_id
  or visibility = 'public'
);

drop policy if exists manuscripts_insert_owner on public.manuscripts;
create policy manuscripts_insert_owner
on public.manuscripts
for insert
with check (auth.uid() = owner_id);

drop policy if exists manuscripts_update_owner on public.manuscripts;
create policy manuscripts_update_owner
on public.manuscripts
for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists manuscripts_delete_owner on public.manuscripts;
create policy manuscripts_delete_owner
on public.manuscripts
for delete
using (auth.uid() = owner_id);

-- 1b) Chapter read policy includes published chapters from published manuscripts
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

-- 2) Dedicated cover bucket
insert into storage.buckets (id, name, public)
values ('manuscript-covers', 'manuscript-covers', true)
on conflict (id) do nothing;

-- 3) Storage object policies for manuscript covers
drop policy if exists manuscript_covers_read_public on storage.objects;
create policy manuscript_covers_read_public
on storage.objects
for select
using (bucket_id = 'manuscript-covers');

drop policy if exists manuscript_covers_insert_own on storage.objects;
create policy manuscript_covers_insert_own
on storage.objects
for insert
with check (
  bucket_id = 'manuscript-covers'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists manuscript_covers_update_own on storage.objects;
create policy manuscript_covers_update_own
on storage.objects
for update
using (
  bucket_id = 'manuscript-covers'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'manuscript-covers'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists manuscript_covers_delete_own on storage.objects;
create policy manuscript_covers_delete_own
on storage.objects
for delete
using (
  bucket_id = 'manuscript-covers'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);
