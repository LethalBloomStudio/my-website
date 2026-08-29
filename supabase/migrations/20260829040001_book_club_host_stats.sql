-- Book Club Phase 1: persistent per-user hosting count.
--
-- Drives host-selection priority (fewest times_hosted wins). Deliberately
-- its own table rather than a column on accounts -- feature-scoped, never
-- resets, never touched outside the host-selection path.
create table public.book_club_host_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  times_hosted integer not null default 0,
  last_hosted_at timestamptz
);

alter table public.book_club_host_stats enable row level security;

create policy book_club_host_stats_select_own
on public.book_club_host_stats
for select
using (auth.uid() = user_id);

-- No write policy for regular users -- only advance_book_club_cycles()
-- (SECURITY DEFINER) increments times_hosted, at host-selection time.
