-- Bloom Circle: same RLS hardening as Book Club (see
-- 20260829040021_book_club_feature_flag_rls.sql for the full rationale).
-- Admins always bypass; everyone else needs feature_flags.bloom_circle
-- enabled. DELETE isn't relevant here (no delete policies exist on these
-- tables at all).
--
-- Note: bloom_circle_threads/comments' policy text below reflects their
-- *current* live definitions (post-030000 cycle-gating removal,
-- post-020001 recursion fix) -- this migration fully replaces each policy
-- rather than trying to incrementally alter it, so the end state is
-- correct even if something here doesn't match byte-for-byte with what's
-- actually live.
create or replace function public.bloom_circle_feature_enabled()
returns boolean
language sql
stable
set search_path = public
as $$
  select
    exists (select 1 from public.accounts where user_id = auth.uid() and is_admin = true)
    or coalesce((select is_enabled from public.feature_flags where name = 'bloom_circle'), false);
$$;

-- bloom_circle_topics
drop policy if exists bloom_circle_topics_select_adult on public.bloom_circle_topics;
create policy bloom_circle_topics_select_adult
on public.bloom_circle_topics
for select
using (public.bloom_circle_feature_enabled() and public.bloom_circle_is_adult());

-- bloom_circle_threads
drop policy if exists bloom_circle_threads_select_adult on public.bloom_circle_threads;
create policy bloom_circle_threads_select_adult
on public.bloom_circle_threads
for select
using (
  public.bloom_circle_feature_enabled()
  and public.bloom_circle_is_adult()
  and (status <> 'scheduled' or submitter_id = auth.uid())
);

drop policy if exists bloom_circle_threads_insert_adult on public.bloom_circle_threads;
create policy bloom_circle_threads_insert_adult
on public.bloom_circle_threads
for insert
with check (public.bloom_circle_feature_enabled() and submitter_id = auth.uid() and public.bloom_circle_is_adult());

drop policy if exists bloom_circle_threads_update_own on public.bloom_circle_threads;
create policy bloom_circle_threads_update_own
on public.bloom_circle_threads
for update
using (public.bloom_circle_feature_enabled() and auth.uid() = submitter_id and public.bloom_circle_is_adult())
with check (public.bloom_circle_feature_enabled() and auth.uid() = submitter_id and public.bloom_circle_is_adult());

-- bloom_circle_comments
drop policy if exists bloom_circle_comments_select_adult on public.bloom_circle_comments;
create policy bloom_circle_comments_select_adult
on public.bloom_circle_comments
for select
using (
  public.bloom_circle_feature_enabled()
  and public.bloom_circle_is_adult()
  and exists (
    select 1 from public.bloom_circle_threads t
    where t.id = thread_id and t.status in ('active', 'archived')
  )
);

drop policy if exists bloom_circle_comments_insert_adult on public.bloom_circle_comments;
create policy bloom_circle_comments_insert_adult
on public.bloom_circle_comments
for insert
with check (
  public.bloom_circle_feature_enabled()
  and author_id = auth.uid()
  and public.bloom_circle_is_adult()
  and exists (
    select 1 from public.bloom_circle_threads t
    where t.id = thread_id and t.status in ('active', 'archived')
  )
  and public.bloom_circle_valid_parent_comment(parent_comment_id, thread_id)
);

drop policy if exists bloom_circle_comments_update_own on public.bloom_circle_comments;
create policy bloom_circle_comments_update_own
on public.bloom_circle_comments
for update
using (public.bloom_circle_feature_enabled() and author_id = auth.uid() and public.bloom_circle_is_adult())
with check (public.bloom_circle_feature_enabled() and author_id = auth.uid() and public.bloom_circle_is_adult());
