alter table public.manuscript_chapters
  add column if not exists published_at timestamptz;

create or replace function public.set_manuscript_chapter_published_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_private = false then
    if tg_op = 'INSERT' then
      new.published_at := coalesce(new.published_at, now());
    elsif old.is_private is distinct from new.is_private and old.is_private = true then
      new.published_at := now();
    elsif new.published_at is null then
      new.published_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists manuscript_chapters_set_published_at on public.manuscript_chapters;
create trigger manuscript_chapters_set_published_at
before insert or update on public.manuscript_chapters
for each row
execute function public.set_manuscript_chapter_published_at();

update public.manuscript_chapters
set published_at = created_at
where is_private = false
  and published_at is null;
