-- Owner-only-visible record of why a beta reader left (or was removed from) a manuscript.
-- Append-only audit log: no update/delete policies, and never exposed to the reader.

create table public.manuscript_reader_exit_reasons (
  id uuid primary key default gen_random_uuid(),
  manuscript_id uuid not null references public.manuscripts(id) on delete cascade,
  reader_id uuid not null references auth.users(id) on delete cascade,
  initiated_by text not null check (initiated_by in ('reader','owner')),
  reason_category text not null,
  reason_detail text,
  created_at timestamptz not null default now()
);

create index manuscript_reader_exit_reasons_lookup_idx
  on public.manuscript_reader_exit_reasons (manuscript_id, reader_id, created_at desc);

alter table public.manuscript_reader_exit_reasons enable row level security;

-- Owner can read all exit reasons for their manuscripts. No one else - not the reader, not other readers.
drop policy if exists "exit_reasons_select_owner" on public.manuscript_reader_exit_reasons;
create policy "exit_reasons_select_owner"
on public.manuscript_reader_exit_reasons for select
using (
  exists (
    select 1 from public.manuscripts m
    where m.id = manuscript_reader_exit_reasons.manuscript_id
      and m.owner_id = auth.uid()
  )
);

-- Reader can insert their own "leave" row.
drop policy if exists "exit_reasons_insert_reader" on public.manuscript_reader_exit_reasons;
create policy "exit_reasons_insert_reader"
on public.manuscript_reader_exit_reasons for insert
with check (
  initiated_by = 'reader'
  and auth.uid() = reader_id
);

-- Owner can insert a "removal" row for a reader on their own manuscript.
drop policy if exists "exit_reasons_insert_owner" on public.manuscript_reader_exit_reasons;
create policy "exit_reasons_insert_owner"
on public.manuscript_reader_exit_reasons for insert
with check (
  initiated_by = 'owner'
  and exists (
    select 1 from public.manuscripts m
    where m.id = manuscript_reader_exit_reasons.manuscript_id
      and m.owner_id = auth.uid()
  )
);
