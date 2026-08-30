-- Book Club admin override: delete a cycle ("meeting").
--
-- Every book_club_* child table's cycle_id FK already has "on delete
-- cascade" (host_signups, participants, book_options, book_votes,
-- comments, questionnaire_questions, question_responses, check_ins,
-- weekly_checkmarks, clean_sweep_bonuses), so deleting the cycle row
-- cleans up every related row automatically. The one non-cascading FK is
-- book_club_cycles.winning_book_option_id -> book_club_book_options(id)
-- (plain NO ACTION) -- nulling it out first avoids depending on Postgres
-- resolving that mutual reference correctly mid-cascade, even though it
-- would in practice (both sides are removed in the same statement).
--
-- Does NOT claw back Bloom Coins already credited for that cycle
-- (weekly-checkmark or clean-sweep-bonus payouts) -- those stay paid out,
-- same as any other reward on this platform once earned. Flagged as a
-- deliberate limitation, not an oversight: reversing already-credited
-- currency is a materially different, riskier operation than removing a
-- cycle's interactive data, and wasn't asked for.
--
-- Immediately backfills a fresh host_pending cycle if the deleted one was
-- the only non-completed row, so deleting the live cycle doesn't leave a
-- gap until the next 15-minute cron tick.
--
-- Only callable with no end-user session (auth.uid() is null) -- i.e. only
-- through the admin API route's service-role client, which has already
-- verified is_admin via verifyAdmin() before ever calling this. Same
-- guard as book_club_admin_assign() and book_club_try_award_weekly_checkmark().
create or replace function public.book_club_admin_delete_cycle(p_cycle_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    raise exception 'not permitted';
  end if;

  update public.book_club_cycles set winning_book_option_id = null where id = p_cycle_id;
  delete from public.book_club_cycles where id = p_cycle_id;

  if not exists (select 1 from public.book_club_cycles where status <> 'completed') then
    insert into public.book_club_cycles (status) values ('host_pending');
  end if;
end;
$$;
