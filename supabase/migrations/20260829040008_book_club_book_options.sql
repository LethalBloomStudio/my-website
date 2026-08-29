-- Book Club Phase 2: the up-to-5-slot book slate.
--
-- "One book per non-host participant" (host may fill several/all slots) is
-- a cross-row rule a CHECK constraint can't express -- it depends on
-- comparing submitted_by against the cycle's host_user_id -- so it's
-- enforced in the API route (app/api/book-club/submit-book-option), not
-- here. RLS just requires slate_building and participancy.
create table public.book_club_book_options (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.book_club_cycles(id) on delete cascade,
  slot_number integer not null check (slot_number between 1 and 5),
  submitted_by uuid not null references auth.users(id),
  book_title text not null,
  book_author text not null,
  created_at timestamptz not null default now(),
  unique (cycle_id, slot_number)
);

alter table public.book_club_cycles
  add constraint book_club_cycles_winning_book_option_fkey
  foreign key (winning_book_option_id) references public.book_club_book_options(id);

alter table public.book_club_book_options enable row level security;

create policy book_club_book_options_select
on public.book_club_book_options
for select
using (public.bloom_circle_is_adult() and public.book_club_is_participant(cycle_id));

create policy book_club_book_options_insert
on public.book_club_book_options
for insert
with check (
  submitted_by = auth.uid()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id and c.status = 'slate_building'
  )
);
