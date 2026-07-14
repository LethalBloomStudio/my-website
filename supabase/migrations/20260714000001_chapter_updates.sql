-- Chapter update notifications: author-posted "what changed" notes, and
-- per-reader read tracking so the "New updates" tag can be cleared per chapter.

create table if not exists public.chapter_updates (
  id          uuid primary key default gen_random_uuid(),
  chapter_id  uuid not null references public.manuscript_chapters(id) on delete cascade,
  author_id   uuid not null references auth.users(id) on delete cascade,
  categories  text[] not null default '{}' check (
    categories <@ array[
      'Fixed typos/grammar',
      'Revised dialogue',
      'Added scene',
      'Removed scene',
      'Rewrote section',
      'Changed pacing/structure',
      'Other'
    ]::text[]
  ),
  note        text check (char_length(note) <= 200),
  created_at  timestamptz not null default now()
);

create index if not exists chapter_updates_chapter_id_idx on public.chapter_updates (chapter_id);
create index if not exists chapter_updates_author_id_idx  on public.chapter_updates (author_id);

alter table public.chapter_updates enable row level security;

create policy "chapter_updates_insert_author"
on public.chapter_updates for insert
with check (
  (select auth.uid()) = author_id
  and exists (
    select 1 from public.manuscript_chapters c
    join public.manuscripts m on m.id = c.manuscript_id
    where c.id = chapter_updates.chapter_id and m.owner_id = (select auth.uid())
  )
);

create policy "chapter_updates_select_author_or_feedback_reader"
on public.chapter_updates for select
using (
  (select auth.uid()) = author_id
  or exists (
    select 1 from public.line_feedback lf
    where lf.chapter_id = chapter_updates.chapter_id
      and lf.reader_id = (select auth.uid())
  )
);

create table if not exists public.chapter_update_reads (
  id            uuid primary key default gen_random_uuid(),
  chapter_id    uuid not null references public.manuscript_chapters(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  last_read_at  timestamptz not null default now(),
  unique (chapter_id, user_id)
);

create index if not exists chapter_update_reads_user_id_idx on public.chapter_update_reads (user_id);

alter table public.chapter_update_reads enable row level security;

create policy "chapter_update_reads_select_own"
on public.chapter_update_reads for select
using ((select auth.uid()) = user_id);

create policy "chapter_update_reads_insert_own"
on public.chapter_update_reads for insert
with check ((select auth.uid()) = user_id);

create policy "chapter_update_reads_update_own"
on public.chapter_update_reads for update
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
