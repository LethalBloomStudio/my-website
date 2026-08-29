-- Book Club Phase 2: voting.
--
-- Base table SELECT is restricted to your own vote row only -- "visible
-- live tally" for participants (confirmed) means aggregate counts, not
-- exposing who voted for what to other members. book_club_vote_tally()
-- below is the actual live-tally surface: SECURITY DEFINER so it can read
-- every vote row to aggregate, but it checks participancy itself before
-- returning anything, so it's no more permissive than the RLS it's
-- standing in for.
create table public.book_club_book_votes (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.book_club_cycles(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  book_option_id uuid not null references public.book_club_book_options(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, voter_id)
);

alter table public.book_club_book_votes enable row level security;

create policy book_club_book_votes_select_own
on public.book_club_book_votes
for select
using (auth.uid() = voter_id);

create policy book_club_book_votes_insert_own
on public.book_club_book_votes
for insert
with check (
  voter_id = auth.uid()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id and c.status = 'voting' and now() < c.voting_closes_at
  )
);

create policy book_club_book_votes_update_own
on public.book_club_book_votes
for update
using (auth.uid() = voter_id)
with check (
  voter_id = auth.uid()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and exists (
    select 1 from public.book_club_cycles c
    where c.id = cycle_id and c.status = 'voting' and now() < c.voting_closes_at
  )
);

create or replace function public.book_club_vote_tally(p_cycle_id uuid)
returns table (book_option_id uuid, vote_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.book_club_is_participant(p_cycle_id) then
    raise exception 'not permitted';
  end if;

  return query
    select v.book_option_id, count(*)
    from public.book_club_book_votes v
    where v.cycle_id = p_cycle_id
    group by v.book_option_id;
end;
$$;
