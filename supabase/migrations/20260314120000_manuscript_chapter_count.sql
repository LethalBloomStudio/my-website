-- Add chapter_count to manuscripts so it's visible without querying manuscript_chapters
alter table public.manuscripts
  add column if not exists chapter_count integer not null default 0;

-- Back-fill from existing chapters
update public.manuscripts m
set chapter_count = (
  select count(*) from public.manuscript_chapters c
  where c.manuscript_id = m.id
);

-- Also back-fill word_count from chapter content where it is 0 / null
update public.manuscripts m
set word_count = (
  select coalesce(
    sum(
      array_length(
        regexp_split_to_array(trim(c.content), '\s+'),
        1
      )
    ), 0
  )
  from public.manuscript_chapters c
  where c.manuscript_id = m.id
    and trim(c.content) <> ''
)
where m.word_count is null or m.word_count = 0;

-- Trigger function: keep chapter_count and word_count in sync
create or replace function public.sync_manuscript_chapter_stats()
returns trigger
language plpgsql
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

drop trigger if exists manuscript_chapters_sync_stats on public.manuscript_chapters;
create trigger manuscript_chapters_sync_stats
after insert or update or delete on public.manuscript_chapters
for each row execute function public.sync_manuscript_chapter_stats();
