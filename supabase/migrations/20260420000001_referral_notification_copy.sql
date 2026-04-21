create or replace function public.apply_signup_referral(
  p_referred_user_id uuid,
  p_referral_username text
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_input text;
  v_referrer_id uuid;
  v_referrer_username text;
  v_referrer_balance bigint;
  v_referred_balance bigint;
begin
  v_input := lower(trim(coalesce(p_referral_username, '')));
  v_input := regexp_replace(v_input, '^@+', '');

  if v_input = '' then
    return;
  end if;

  if exists (select 1 from public.referrals where referred_user_id = p_referred_user_id) then
    return;
  end if;

  select user_id, username
    into v_referrer_id, v_referrer_username
  from public.public_profiles
  where lower(coalesce(username, '')) = v_input
  limit 1;

  if v_referrer_id is null then
    insert into public.referrals (
      referred_user_id,
      referrer_user_id,
      referral_username_input,
      status,
      updated_at
    )
    values (
      p_referred_user_id,
      null,
      v_input,
      'invalid_referrer',
      now()
    );
    return;
  end if;

  if v_referrer_id = p_referred_user_id then
    insert into public.referrals (
      referred_user_id,
      referrer_user_id,
      referral_username_input,
      status,
      updated_at
    )
    values (
      p_referred_user_id,
      v_referrer_id,
      v_input,
      'invalid_self',
      now()
    );
    return;
  end if;

  insert into public.referrals (
    referred_user_id,
    referrer_user_id,
    referral_username_input,
    status,
    verified_at,
    updated_at
  )
  values (
    p_referred_user_id,
    v_referrer_id,
    v_input,
    'verified',
    now(),
    now()
  );

  update public.accounts
  set bloom_coins = bloom_coins + 100,
      updated_at = now()
  where user_id = v_referrer_id
  returning bloom_coins into v_referrer_balance;

  update public.accounts
  set bloom_coins = bloom_coins + 50,
      updated_at = now()
  where user_id = p_referred_user_id
  returning bloom_coins into v_referred_balance;

  insert into public.bloom_coin_ledger (user_id, delta, reason, metadata)
  values
    (
      v_referrer_id,
      100,
      'referral_referrer_bonus',
      jsonb_build_object(
        'referred_user_id', p_referred_user_id,
        'referrer_user_id', v_referrer_id,
        'referral_username', v_referrer_username,
        'coins', 100
      )
    ),
    (
      p_referred_user_id,
      50,
      'referral_signup_bonus',
      jsonb_build_object(
        'referred_user_id', p_referred_user_id,
        'referrer_user_id', v_referrer_id,
        'referral_username', v_referrer_username,
        'coins', 50
      )
    );

  insert into public.system_notifications (user_id, category, title, body, severity, dedupe_key)
  values
    (
      v_referrer_id,
      'system',
      'Thank you for referring a new member',
      'Thank you for referring someone to Lethal Bloom Studio. Your referral was verified and 100 Bloom Coins have been added to your account.',
      'info',
      'referral-referrer-' || p_referred_user_id::text
    ),
    (
      p_referred_user_id,
      'system',
      'Welcome to Lethal Bloom Studio',
      'Thank you for joining Lethal Bloom Studio. Your referral was verified and 50 Bloom Coins have been added to your account.',
      'info',
      'referral-referred-' || p_referred_user_id::text
    );
end;
$function$;
