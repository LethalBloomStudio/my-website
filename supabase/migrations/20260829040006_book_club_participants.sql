-- Book Club Phase 2: opt-in participation.
--
-- Opting in is what grants voting rights and reveals the slate/thread for
-- a cycle (per the "hidden until opted in" rule) -- everything else's RLS
-- hangs off book_club_is_participant() below. Allowed any time before a
-- cycle completes; opting in after voting closes just means you missed the
-- vote, not that you can't join the discussion/questionnaire from then on.
create table public.book_club_participants (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.book_club_cycles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  opted_in_at timestamptz not null default now(),
  unique (cycle_id, user_id)
);

create index book_club_participants_cycle_idx
  on public.book_club_participants (cycle_id);

alter table public.book_club_participants enable row level security;

create policy book_club_participants_select_own
on public.book_club_participants
for select
using (auth.uid() = user_id);

create policy book_club_participants_insert_own
on public.book_club_participants
for insert
with check (
  auth.uid() = user_id
  and public.bloom_circle_is_adult()
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id and c.status <> 'completed'
  )
);

-- Opting back out has no retroactive effect on checkmarks/coins already
-- earned -- it just stops future visibility. Not disallowed, kept simple.
create policy book_club_participants_delete_own
on public.book_club_participants
for delete
using (auth.uid() = user_id);

-- Reused by every other book_club_* table's RLS to gate on "is this caller
-- opted into this cycle". Plain SQL, NOT security definer: the EXISTS
-- filters to user_id = auth.uid(), which is exactly the row this table's
-- own select-own policy already lets that caller read -- no self-reference
-- recursion risk (that only bites when a table's policy re-reads *itself*
-- with a *different* row's data, e.g. the bloom_circle_comments parent-check
-- bug), so no SECURITY DEFINER wrapper needed here.
create or replace function public.book_club_is_participant(p_cycle_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.book_club_participants
    where cycle_id = p_cycle_id and user_id = auth.uid()
  );
$$;
