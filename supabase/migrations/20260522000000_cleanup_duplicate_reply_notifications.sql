-- One-time cleanup: remove legacy duplicate reply notifications
-- Root cause: before the fix, a client-side insert and a server-side insert both fired
-- on every reply, producing two rows per event for the same (user_id, post_id) pair.
-- This migration keeps one row per user per post_id, propagating is_read = true if
-- either of the pair had been read (so badge counts are not inflated after cleanup).

begin;

-- Step 1: Identify the winner for each duplicate group.
-- Ordering: is_read DESC (true beats false), then created_at DESC (newer beats older).
-- We only look at social-category reply notifications.
with ranked as (
  select
    id,
    user_id,
    metadata->>'post_id'          as post_id,
    is_read,
    created_at,
    row_number() over (
      partition by user_id, metadata->>'post_id'
      order by is_read desc, created_at desc
    )                             as rn,
    -- Did ANY row in this group get marked read?
    bool_or(is_read) over (
      partition by user_id, metadata->>'post_id'
    )                             as any_read
  from public.system_notifications
  where
    category = 'social'
    and title in (
      'New reply on your discussion post',
      'Someone replied to your comment'
    )
    and metadata ? 'post_id'
),
duplicated_groups as (
  -- Only touch groups that actually have duplicates
  select post_id, user_id
  from ranked
  group by user_id, post_id
  having count(*) > 1
),
winners as (
  select r.id, r.any_read
  from ranked r
  inner join duplicated_groups d
    on  r.user_id  = d.user_id
    and r.post_id  = d.post_id
  where r.rn = 1   -- the winner row for this group
),
losers as (
  select r.id
  from ranked r
  inner join duplicated_groups d
    on  r.user_id  = d.user_id
    and r.post_id  = d.post_id
  where r.rn > 1   -- every non-winner row in the group
)

-- Step 2: Propagate is_read = true to winner rows where at least one sibling was read.
-- This prevents a read notification from "disappearing" and leaving the badge inflated.
update public.system_notifications sn
set
  is_read  = true,
  read_at  = coalesce(sn.read_at, now())
from winners w
where
  sn.id       = w.id
  and w.any_read = true
  and sn.is_read = false;   -- only touch rows that aren't already marked read

-- Step 3: Delete all duplicate (loser) rows.
delete from public.system_notifications
where id in (select id from (
  select r.id
  from ranked r
  inner join duplicated_groups d
    on  r.user_id  = d.user_id
    and r.post_id  = d.post_id
  where r.rn > 1
) losers_ids);

commit;
