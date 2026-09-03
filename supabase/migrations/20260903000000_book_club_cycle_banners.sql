-- Book Club: host-editable banner for the active month's cycle page.
--
-- One row per cycle, keyed by cycle_id -- a new "month" is always a new
-- book_club_cycles row (per that table's own comment: "a fresh host_pending
-- row replaces it"), so a banner naturally starts blank for each new host
-- with no reset logic needed. Old rows are harmless leftovers, cascade-
-- deleted only if their cycle row is ever deleted.
--
-- Deliberately its own table rather than columns on book_club_cycles:
-- that table has no UPDATE policy for regular users at all (every other
-- migration on it says so explicitly) because RLS filters rows, not
-- columns -- a host-scoped UPDATE policy directly on book_club_cycles
-- would let a host's client rewrite status/winning_book_option_id/etc. on
-- their own row, not just the banner text. Same shape as
-- book_club_questionnaire_questions' host-only write policies.
create table public.book_club_cycle_banners (
  cycle_id uuid primary key references public.book_club_cycles(id) on delete cascade,
  message text not null default '',
  is_active boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.book_club_cycle_banners enable row level security;

-- Same visibility as the cycle itself -- any adult, matching
-- book_club_cycles_select's "not participant-gated pre-completion" shape.
create policy book_club_cycle_banners_select
on public.book_club_cycle_banners
for select
using (public.bloom_circle_is_adult());

-- Only the *current* host of the *currently active* cycle can create or
-- edit its banner row. Both insert and update re-check status = 'active'
-- (not just host_user_id) so a host loses write access the moment their
-- cycle stops being "this month" -- no separate cleanup needed when a
-- cycle completes.
create policy book_club_cycle_banners_insert_host
on public.book_club_cycle_banners
for insert
with check (
  exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id and c.host_user_id = auth.uid() and c.status = 'active'
  )
);

create policy book_club_cycle_banners_update_host
on public.book_club_cycle_banners
for update
using (
  exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id and c.host_user_id = auth.uid() and c.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id and c.host_user_id = auth.uid() and c.status = 'active'
  )
);
