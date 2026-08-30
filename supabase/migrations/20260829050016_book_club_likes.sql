-- Book Club: a like button on weekly answers, replies-to-answers, and
-- comments (both per-week Discussion and Group Thoughts -- same table,
-- so no distinction needed here). One shared table rather than three --
-- the host-reward gate needs "how many likes has this person given this
-- cycle" as a single cross-type count, which a shared table makes a plain
-- count(*), not a union across three tables.
--
-- Exactly one of response_id/reply_id/comment_id is set per row (CHECK
-- below); each gets its own partial unique index so a user can't
-- double-like the same item (that's also what makes the button a clean
-- toggle -- insert to like, delete to unlike).
create table public.book_club_likes (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.book_club_cycles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  response_id uuid references public.book_club_question_responses(id) on delete cascade,
  reply_id uuid references public.book_club_response_replies(id) on delete cascade,
  comment_id uuid references public.book_club_comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (case when response_id is not null then 1 else 0 end
      + case when reply_id is not null then 1 else 0 end
      + case when comment_id is not null then 1 else 0 end) = 1
  )
);

create unique index book_club_likes_response_unique on public.book_club_likes (user_id, response_id) where response_id is not null;
create unique index book_club_likes_reply_unique on public.book_club_likes (user_id, reply_id) where reply_id is not null;
create unique index book_club_likes_comment_unique on public.book_club_likes (user_id, comment_id) where comment_id is not null;

create index book_club_likes_response_idx on public.book_club_likes (response_id) where response_id is not null;
create index book_club_likes_reply_idx on public.book_club_likes (reply_id) where reply_id is not null;
create index book_club_likes_comment_idx on public.book_club_likes (comment_id) where comment_id is not null;
create index book_club_likes_cycle_user_idx on public.book_club_likes (cycle_id, user_id);

alter table public.book_club_likes enable row level security;

-- Same lockout as everything else once a cycle completes -- liking history
-- goes dark along with the threads/responses it's attached to.
create policy book_club_likes_select
on public.book_club_likes
for select
using (
  public.book_club_feature_enabled()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and exists (select 1 from public.book_club_cycles c where c.id = cycle_id and c.status = 'active')
);

-- No reward for the liker (per the spec -- this is a plain reaction), so
-- unlike replies/comments there's no current-week restriction: anything
-- currently visible (including a closed past week's content) can be liked.
-- The trailing OR ties response_id/reply_id/comment_id to the same
-- cycle_id, same defensive-EXISTS style as book_club_response_replies_insert.
create policy book_club_likes_insert
on public.book_club_likes
for insert
with check (
  public.book_club_feature_enabled()
  and user_id = auth.uid()
  and public.bloom_circle_is_adult()
  and public.book_club_is_participant(cycle_id)
  and exists (select 1 from public.book_club_cycles c where c.id = cycle_id and c.status = 'active')
  and (
    (response_id is not null and exists (
      select 1 from public.book_club_question_responses r where r.id = response_id and r.cycle_id = book_club_likes.cycle_id
    ))
    or (reply_id is not null and exists (
      select 1 from public.book_club_response_replies rr where rr.id = reply_id and rr.cycle_id = book_club_likes.cycle_id
    ))
    or (comment_id is not null and exists (
      select 1 from public.book_club_comments c2 where c2.id = comment_id and c2.cycle_id = book_club_likes.cycle_id
    ))
  )
);

create policy book_club_likes_delete_own
on public.book_club_likes
for delete
using (user_id = auth.uid());
