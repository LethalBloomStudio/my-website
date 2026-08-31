-- Book Club: let a cycle's host veto a book someone else submitted to the
-- slate, with a required reason, before voting closes -- editable window
-- matches book_club_edit_book_option's (host_pending or voting). Vetoing
-- deletes the book_club_book_options row outright (cascades to any
-- book_club_book_votes on it, same as a normal delete would), which frees
-- both the slot number and the submitter's "one book per person" check in
-- submit-book-option/route.ts, so they're immediately free to submit a
-- different book -- no separate "un-reject" step needed. A small audit
-- table records what was vetoed and why, since the actual slate row is
-- gone and the host/submitter may want to see this later (e.g. from a
-- notification that's since been dismissed).
create table public.book_club_book_vetoes (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.book_club_cycles(id) on delete cascade,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  vetoed_user_id uuid not null references auth.users(id) on delete cascade,
  book_title text not null,
  book_author text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.book_club_book_vetoes enable row level security;

-- Both sides of a veto can see it -- the host who issued it, and the
-- person whose book it was. No client write policy -- only
-- book_club_veto_book() writes here.
create policy book_club_book_vetoes_select
on public.book_club_book_vetoes
for select
using (auth.uid() = host_user_id or auth.uid() = vetoed_user_id);

-- Vetoing is a SECURITY DEFINER RPC rather than a raw RLS delete policy
-- for the same reason book_club_edit_book_option is: it needs to write a
-- second table (the audit log, and a notification for someone who isn't
-- the caller) atomically with the delete.
create or replace function public.book_club_veto_book(p_option_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_option record;
  v_cycle_status text;
  v_cycle_host_user_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_uid is null or not public.bloom_circle_is_adult() or not public.book_club_feature_enabled() then
    raise exception 'not permitted';
  end if;
  if v_reason is null then
    raise exception 'a reason is required';
  end if;

  select * into v_option from public.book_club_book_options where id = p_option_id;
  if v_option is null then
    raise exception 'that book is no longer on the slate';
  end if;

  select status, host_user_id into v_cycle_status, v_cycle_host_user_id
  from public.book_club_cycles where id = v_option.cycle_id;
  if v_cycle_host_user_id is null or v_cycle_host_user_id <> v_uid then
    raise exception 'not permitted';
  end if;
  if v_cycle_status not in ('host_pending', 'voting') then
    raise exception 'this book can no longer be vetoed';
  end if;
  if v_option.submitted_by = v_uid then
    raise exception 'you can''t veto your own book';
  end if;

  insert into public.book_club_book_vetoes (cycle_id, host_user_id, vetoed_user_id, book_title, book_author, reason)
  values (v_option.cycle_id, v_uid, v_option.submitted_by, v_option.book_title, v_option.book_author, v_reason);

  delete from public.book_club_book_options where id = p_option_id;

  insert into public.system_notifications (user_id, category, title, body, severity, dedupe_key, metadata)
  values (
    v_option.submitted_by, 'book_club_host',
    'Your Book Club submission was vetoed',
    'The host vetoed "' || v_option.book_title || '" by ' || v_option.book_author || '. Reason: ' || v_reason || ' You''re welcome to submit a different book instead.',
    'info', 'book-club-veto-' || p_option_id::text,
    jsonb_build_object('link', '/book-club/cycle/' || v_option.cycle_id, 'link_label', 'Add a different book', 'cycle_id', v_option.cycle_id)
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;
