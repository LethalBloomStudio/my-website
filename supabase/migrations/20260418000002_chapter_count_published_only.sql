-- Fix chapter_count to only count published (non-private) chapters of type 'chapter'.
-- Prologues, epilogues, and trigger pages are excluded from the count.

create or replace function public.sync_manuscript_chapter_stats()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  mid uuid;
begin
  mid := coalesce(NEW.manuscript_id, OLD.manuscript_id);
  update public.manuscripts
  set
    chapter_count = (
      select count(*) from public.manuscript_chapters
      where manuscript_id = mid
        and is_private = false
        and chapter_type = 'chapter'
    ),
    word_count = (
      select coalesce(
        sum(
          array_length(
            regexp_split_to_array(trim(content), '\s+'),
            1
          )
        ), 0
      )
      from public.manuscript_chapters
      where manuscript_id = mid
        and trim(content) <> ''
    )
  where id = mid;
  return coalesce(NEW, OLD);
end;
$$;

-- Backfill existing manuscripts with the corrected count
update public.manuscripts m
set chapter_count = (
  select count(*) from public.manuscript_chapters c
  where c.manuscript_id = m.id
    and c.is_private = false
    and c.chapter_type = 'chapter'
);
