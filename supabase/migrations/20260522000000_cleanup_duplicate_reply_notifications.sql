-- One-time cleanup: remove legacy duplicate reply notifications
-- Root cause: before the fix, a client-side insert and a server-side insert both fired
-- on every reply, producing two rows per event for the same (user_id, post_id) pair.
-- This migration keeps one row per user per post_id, propagating is_read = true if
-- either of the pair had been read (so badge counts are not inflated after cleanup).
--
-- Everything runs as a single statement inside a transaction so any error rolls back.

begin;

with ranked as (
  -- Score every social reply notification row.
  -- Winner = rn 1 (is_read DESC so true beats false, then newest wins).
  -- any_read = true if ANY row in the group was ever marked read.
  select
    id,
    user_id,
    metadata->>'post_id'      as post_id,
    is_read,
    created_at,
    row_number() over (
      partition by user_id, metadata->>'post_id'
      order by is_read desc, created_at desc
    )                         as rn,
    bool_or(is_read) over (
      partition by user_id, metadata->>'post_id'
    )                         as any_read
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
  -- Only target (user_id, post_id) pairs that actually have more than one row.
  select user_id, post_id
  from ranked
  group by user_id, post_id
  having count(*) > 1
),
winners as (
  select r.id, r.any_read
  from ranked r
  join duplicated_groups d using (user_id, post_id)
  where r.rn = 1
),
losers as (
  select r.id
  from ranked r
  join duplicated_groups d using (user_id, post_id)
  where r.rn > 1
),
-- Step 1: propagate is_read = true to the winner when any sibling was read.
-- This prevents badge inflation after duplicates are removed.
do_update as (
  update public.system_notifications sn
  set
    is_read = true,
    read_at = coalesce(sn.read_at, now())
  from winners w
  where
    sn.id          = w.id
    and w.any_read = true
    and sn.is_read = false
  returning sn.id
)
-- Step 2: delete all loser rows.
-- Both the UPDATE above and this DELETE execute against the same snapshot,
-- and they target disjoint sets of rows (winners vs losers), so there is no conflict.
delete from public.system_notifications
where id in (select id from losers);

commit;
