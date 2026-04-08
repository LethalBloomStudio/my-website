-- Fix: coin_balance view was SECURITY DEFINER, meaning it ran with the
-- view creator's permissions instead of the querying user's. Switching to
-- SECURITY INVOKER ensures RLS on coin_transactions applies correctly.
create or replace view public.coin_balance
  with (security_invoker = true)
as
select
  user_id,
  coalesce(sum(amount), 0) as balance
from coin_transactions
where status = 'posted'
group by user_id;
