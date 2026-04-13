-- Add updated_at column to manuscripts so that any moddatetime / generic
-- "set updated_at" triggers stop throwing:
--   record "new" has no field "updated_at"

alter table public.manuscripts
  add column if not exists updated_at timestamptz not null default now();

-- Back-fill existing rows
update public.manuscripts set updated_at = created_at where updated_at = now();

-- Auto-maintain updated_at on every UPDATE
create or replace function public.set_manuscripts_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists manuscripts_set_updated_at on public.manuscripts;
create trigger manuscripts_set_updated_at
before update on public.manuscripts
for each row execute function public.set_manuscripts_updated_at();
