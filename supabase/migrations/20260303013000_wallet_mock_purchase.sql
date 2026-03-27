-- Mock coin purchase flow for pre-payment integration testing.
-- This keeps balance and ledger updates atomic and auditable.

create or replace function public.create_mock_coin_purchase(
  p_package_id text
)
returns table (transaction_id uuid, coins_added int, new_balance bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_coins int;
  v_price_cents int;
  v_tx_id uuid;
  v_balance bigint;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_package_id = 'starter_100' then
    v_coins := 100;
    v_price_cents := 100;
  elsif p_package_id = 'writer_350' then
    v_coins := 350;
    v_price_cents := 300;
  elsif p_package_id = 'studio_600' then
    v_coins := 600;
    v_price_cents := 500;
  else
    raise exception 'Unknown package';
  end if;

  update public.accounts
  set bloom_coins = bloom_coins + v_coins,
      updated_at = now(),
      last_active_at = now()
  where user_id = v_user_id
  returning bloom_coins into v_balance;

  if v_balance is null then
    raise exception 'Account not found';
  end if;

  insert into public.bloom_coin_ledger (user_id, delta, reason, metadata)
  values (
    v_user_id,
    v_coins,
    'coin_purchase_mock',
    jsonb_build_object(
      'package_id', p_package_id,
      'price_cents', v_price_cents,
      'currency', 'USD'
    )
  )
  returning id into v_tx_id;

  return query select v_tx_id, v_coins, v_balance;
end;
$$;

grant execute on function public.create_mock_coin_purchase(text) to authenticated;
