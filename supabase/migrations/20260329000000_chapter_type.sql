alter table public.manuscript_chapters
  add column if not exists chapter_type text not null default 'chapter';
