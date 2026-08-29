-- Book Club Phase 2: close a leak in book_club_tied_options().
--
-- It's SECURITY DEFINER and had the default PUBLIC execute grant, so any
-- authenticated (or even anon) client could call it directly and learn
-- which books are tied for a cycle they haven't opted into -- bypassing
-- the "hidden until opt-in" rule for vote results. It still needs to be
-- callable with no participancy check from advance_book_club_cycles() and
-- book_club_resolve_tie() (both run with no end-user session / as the
-- function owner during SECURITY DEFINER execution, which always retains
-- implicit execute rights on its own functions regardless of this revoke).
--
-- book_club_my_tied_options() is the client-facing equivalent, gated the
-- same way book_club_vote_tally() already is.
revoke execute on function public.book_club_tied_options(uuid) from public;

create or replace function public.book_club_my_tied_options(p_cycle_id uuid)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.book_club_is_participant(p_cycle_id) then
    raise exception 'not permitted';
  end if;
  return public.book_club_tied_options(p_cycle_id);
end;
$$;
