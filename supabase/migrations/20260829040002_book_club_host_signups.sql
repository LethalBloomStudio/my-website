-- Book Club Phase 1: host-signup pool for the pending/grace-window cycle.
--
-- No INSERT policy here on purpose -- signing up has a side effect (opening
-- the 48h grace window on the *first* signup for a cycle) that a plain RLS
-- INSERT can't express safely without a race between two "first" signups.
-- book_club_join_host_signup() (next migration, SECURITY DEFINER) is the
-- only path that creates rows here, using a row lock on the cycle to make
-- that transition atomic. Direct client inserts are simply denied by RLS.
create table public.book_club_host_signups (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.book_club_cycles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  times_hosted_snapshot integer not null,
  signed_up_at timestamptz not null default now(),
  unique (cycle_id, user_id)
);

create index book_club_host_signups_cycle_idx
  on public.book_club_host_signups (cycle_id);

alter table public.book_club_host_signups enable row level security;

create policy book_club_host_signups_select_own
on public.book_club_host_signups
for select
using (auth.uid() = user_id);

-- Withdraw from the host-signup pool, but only while the cycle is still
-- accepting signups -- can't pull out from under a selection already made.
create policy book_club_host_signups_delete_own_open
on public.book_club_host_signups
for delete
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id and c.status in ('host_pending', 'host_grace')
  )
);
