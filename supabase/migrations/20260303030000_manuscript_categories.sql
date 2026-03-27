-- Add multi-category support for manuscripts.

alter table public.manuscripts
  add column if not exists categories text[] not null default '{}';

update public.manuscripts
set categories = case
  when coalesce(array_length(categories, 1), 0) = 0 and genre is not null then array[genre]
  else categories
end;
