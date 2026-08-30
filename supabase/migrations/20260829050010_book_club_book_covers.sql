-- Book Club: optional cover image on a book slate option. Same
-- direct-to-storage, public-bucket-with-own-folder-write pattern as
-- manuscript-covers (20260302224100_manuscripts_permissions_and_covers.sql)
-- -- there's no Bloom-Circle-specific image pattern in this codebase to
-- match instead (Bloom Circle threads carry no images at all).
alter table public.book_club_book_options add column cover_image_url text;

insert into storage.buckets (id, name, public)
values ('book-club-covers', 'book-club-covers', true)
on conflict (id) do nothing;

drop policy if exists book_club_covers_read_public on storage.objects;
create policy book_club_covers_read_public
on storage.objects
for select
using (bucket_id = 'book-club-covers');

drop policy if exists book_club_covers_insert_own on storage.objects;
create policy book_club_covers_insert_own
on storage.objects
for insert
with check (
  bucket_id = 'book-club-covers'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists book_club_covers_update_own on storage.objects;
create policy book_club_covers_update_own
on storage.objects
for update
using (
  bucket_id = 'book-club-covers'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'book-club-covers'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists book_club_covers_delete_own on storage.objects;
create policy book_club_covers_delete_own
on storage.objects
for delete
using (
  bucket_id = 'book-club-covers'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);
