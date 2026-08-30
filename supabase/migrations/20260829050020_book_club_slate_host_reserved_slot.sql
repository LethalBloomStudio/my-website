-- Book Club: slot 5 of the up-to-5 book slate is reserved for the host's
-- own pick. Participants fill 1-4 during host_pending (same phase as
-- before); slot 5 can only be filled by the cycle's actual host, and only
-- within a 48h grace window starting at voting_opens_at -- host selection
-- and voting opening happen atomically in the engine (no gap where "we
-- know the host but voting hasn't started"), so there's no earlier moment
-- to reserve it at. If the host doesn't use the window, slot 5 just stays
-- empty for that month -- already a normal state, nothing here assumes
-- exactly 5 options exist. 48h matches the precedent already used twice
-- elsewhere in this feature (the old slate-building window, the tiebreak
-- window).
drop policy if exists book_club_book_options_insert on public.book_club_book_options;
create policy book_club_book_options_insert
on public.book_club_book_options
for insert
with check (
  public.book_club_feature_enabled()
  and submitted_by = auth.uid()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and (
    (
      slot_number <= 4
      and exists (
        select 1 from public.book_club_cycles c
        where c.id = cycle_id and c.status = 'host_pending'
      )
    )
    or (
      slot_number = 5
      and exists (
        select 1 from public.book_club_cycles c
        where c.id = cycle_id
          and c.status = 'voting'
          and c.host_user_id = auth.uid()
          and c.voting_opens_at is not null
          and now() < c.voting_opens_at + interval '48 hours'
      )
    )
  )
);

-- Book Club: the candidate covers/titles/authors become visible to any
-- adult once voting opens -- helps people decide whether to opt in, per
-- explicit product decision. This is a deliberate reversal of
-- 20260829040024's original stance ("every OTHER option in the slate...
-- stays participant-gated" -- only the eventual winner was meant to go
-- public). Vote *casting* is untouched: book_club_book_votes_insert_own/
-- update_own still require participancy, same as always -- only visibility
-- of the slate itself widens here.
drop policy if exists book_club_book_options_select on public.book_club_book_options;
create policy book_club_book_options_select
on public.book_club_book_options
for select
using (
  public.book_club_feature_enabled()
  and public.bloom_circle_is_adult()
  and (
    public.book_club_is_participant(cycle_id)
    or exists (
      select 1 from public.book_club_cycles c
      where c.id = cycle_id and (c.status = 'voting' or c.winning_book_option_id = book_club_book_options.id)
    )
  )
);
