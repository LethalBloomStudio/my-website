-- Fix manuscript create/edit/select permissions and cover-upload storage policies.
-- Run in Supabase SQL editor.

-- 1) Manuscript table owner policies
alter table public.manuscripts enable row level security;

drop policy if exists manuscripts_select_owner on public.manuscripts;
create policy manuscripts_select_owner
on public.manuscripts
for select
using (auth.uid() = owner_id);

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

