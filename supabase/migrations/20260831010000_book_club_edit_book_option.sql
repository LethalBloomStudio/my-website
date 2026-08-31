-- Book Club: submitters could never edit a book they added to the slate --
-- no UPDATE policy existed on book_club_book_options at all. Adding edit
-- capability as a SECURITY DEFINER RPC (rather than a raw RLS UPDATE
-- policy) because a real edit needs to touch a second table the editor
-- doesn't own: per explicit product decision, editing a book resets any
-- votes already cast for it back to zero (the votes were cast against the
-- old title/author, and book_club_book_votes rows belong to the voters,
-- not the submitter -- deleting them requires bypassing RLS, which only a
-- SECURITY DEFINER function can do safely with its own internal checks).
--
-- Only the option's own submitter can edit it, and only while the slate
-- is still live (host_pending or voting) -- same window inserts are
-- allowed in, matching submit-book-option/route.ts's own status checks.
-- cycle_id/slot_number/submitted_by are never touched by this function,
-- so there's no need for a separate immutable-columns guard -- only
-- title/author/cover are ever written.
create or replace function public.book_club_edit_book_option(
  p_option_id uuid, p_book_title text, p_book_author text, p_cover_image_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_option record;
  v_cycle_status text;
  v_title text := nullif(btrim(coalesce(p_book_title, '')), '');
  v_author text := nullif(btrim(coalesce(p_book_author, '')), '');
begin
  if v_uid is null or not public.bloom_circle_is_adult() or not public.book_club_feature_enabled() then
    raise exception 'not permitted';
  end if;
  if v_title is null or v_author is null then
    raise exception 'book title and author are required';
  end if;

  select * into v_option from public.book_club_book_options where id = p_option_id;
  if v_option is null or v_option.submitted_by <> v_uid then
    raise exception 'not permitted';
  end if;

  select status into v_cycle_status from public.book_club_cycles where id = v_option.cycle_id;
  if v_cycle_status not in ('host_pending', 'voting') then
    raise exception 'this book can no longer be edited';
  end if;

  update public.book_club_book_options
  set book_title = v_title, book_author = v_author, cover_image_url = p_cover_image_url
  where id = p_option_id;

  delete from public.book_club_book_votes where book_option_id = p_option_id;
end;
$$;
