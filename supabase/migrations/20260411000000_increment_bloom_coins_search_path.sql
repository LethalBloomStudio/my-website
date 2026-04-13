create or replace function public.increment_bloom_coins(p_user_id uuid, p_amount integer)
returns void
language sql
set search_path = public
as $function$
  update accounts
  set bloom_coins = bloom_coins + p_amount,
      updated_at = now()
  where user_id = p_user_id;
$function$;
