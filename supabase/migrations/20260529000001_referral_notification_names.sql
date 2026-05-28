-- Update referral notification bodies to include referred/referrer names.
-- Pen name is used if set; falls back to @username.

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
  v_referred_name text;
  v_referred_email text;
  v_referred_username text;
  v_referred_pen_name text;
  v_referrer_name text;
  v_referrer_email text;
  v_referrer_pen_name text;
  v_referred_access_disabled boolean;
  v_referrer_access_disabled boolean;
begin
  v_input := lower(trim(coalesce(p_referral_username, '')));
  v_input := regexp_replace(v_input, '^@+', '');

  if v_input = '' then
    return;
  end if;

  if exists (select 1 from public.referrals where referred_user_id = p_referred_user_id) then
    return;
  end if;

  select user_id, username, pen_name
    into v_referrer_id, v_referrer_username, v_referrer_pen_name
  from public.public_profiles
  where lower(coalesce(username, '')) = v_input
  limit 1;

  select full_name, email, referral_access_disabled
    into v_referrer_name, v_referrer_email, v_referrer_access_disabled
  from public.accounts
  where user_id = v_referrer_id;

  select p.username, p.pen_name, a.full_name, a.email, a.referral_access_disabled
    into v_referred_username, v_referred_pen_name, v_referred_name, v_referred_email, v_referred_access_disabled
  from public.accounts a
  left join public.public_profiles p on p.user_id = a.user_id
  where a.user_id = p_referred_user_id;

  if v_referrer_id is null then
    insert into public.referrals (
      referred_user_id, referrer_user_id, referral_username_input, status,
      referred_email_snapshot, referred_name_snapshot, referred_username_snapshot,
      referred_pen_name_snapshot, updated_at
    )
    values (
      p_referred_user_id, null, v_input, 'invalid_referrer',
      v_referred_email, v_referred_name, v_referred_username, v_referred_pen_name, now()
    );
    return;
  end if;

  if v_referrer_id = p_referred_user_id then
    insert into public.referrals (
      referred_user_id, referrer_user_id, referral_username_input, status,
      referred_email_snapshot, referred_name_snapshot, referred_username_snapshot, referred_pen_name_snapshot,
      referrer_email_snapshot, referrer_name_snapshot, referrer_username_snapshot, referrer_pen_name_snapshot,
      updated_at
    )
    values (
      p_referred_user_id, v_referrer_id, v_input, 'invalid_self',
      v_referred_email, v_referred_name, v_referred_username, v_referred_pen_name,
      v_referrer_email, v_referrer_name, v_referrer_username, v_referrer_pen_name,
      now()
    );
    return;
  end if;

  if coalesce(v_referred_access_disabled, false) or coalesce(v_referrer_access_disabled, false) then
    insert into public.referrals (
      referred_user_id, referrer_user_id, referral_username_input, status, verified_at,
      referred_email_snapshot, referred_name_snapshot, referred_username_snapshot, referred_pen_name_snapshot,
      referrer_email_snapshot, referrer_name_snapshot, referrer_username_snapshot, referrer_pen_name_snapshot,
      updated_at
    )
    values (
      p_referred_user_id, v_referrer_id, v_input, 'blocked', now(),
      v_referred_email, v_referred_name, v_referred_username, v_referred_pen_name,
      v_referrer_email, v_referrer_name, v_referrer_username, v_referrer_pen_name,
      now()
    );
    return;
  end if;

  insert into public.referrals (
    referred_user_id, referrer_user_id, referral_username_input, status, verified_at,
    referred_email_snapshot, referred_name_snapshot, referred_username_snapshot, referred_pen_name_snapshot,
    referrer_email_snapshot, referrer_name_snapshot, referrer_username_snapshot, referrer_pen_name_snapshot,
    updated_at
  )
  values (
    p_referred_user_id, v_referrer_id, v_input, 'verified', now(),
    v_referred_email, v_referred_name, v_referred_username, v_referred_pen_name,
    v_referrer_email, v_referrer_name, v_referrer_username, v_referrer_pen_name,
    now()
  );

  update public.accounts
  set bloom_coins = bloom_coins + 100, updated_at = now()
  where user_id = v_referrer_id
  returning bloom_coins into v_referrer_balance;

  update public.accounts
  set bloom_coins = bloom_coins + 50, updated_at = now()
  where user_id = p_referred_user_id
  returning bloom_coins into v_referred_balance;

  insert into public.bloom_coin_ledger (user_id, delta, reason, metadata)
  values
    (
      v_referrer_id, 100, 'referral_referrer_bonus',
      jsonb_build_object(
        'referred_user_id', p_referred_user_id,
        'referrer_user_id', v_referrer_id,
        'referral_username', v_referrer_username,
        'coins', 100
      )
    ),
    (
      p_referred_user_id, 50, 'referral_signup_bonus',
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
      'Thank you for referring ' || coalesce(nullif(trim(v_referred_pen_name), ''), '@' || v_referred_username) || ' to Lethal Bloom Studio. Your referral was verified and 100 Bloom Coins have been added to your account.',
      'info',
      'referral-referrer-' || p_referred_user_id::text
    ),
    (
      p_referred_user_id,
      'system',
      'Welcome to Lethal Bloom Studio',
      'You were referred to Lethal Bloom Studio by ' || coalesce(nullif(trim(v_referrer_pen_name), ''), '@' || v_referrer_username) || '. Your referral was verified and 50 Bloom Coins have been added to your account.',
      'info',
      'referral-referred-' || p_referred_user_id::text
    );
end;
$function$;


create or replace function public.apply_referral_correction(
  p_referral_id uuid,
  p_correct_referrer_username text,
  p_admin_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_referral record;
  v_clean_username text;
  v_new_referrer_id uuid;
  v_new_referrer_username text;
  v_new_referrer_pen_name text;
  v_new_referrer_name text;
  v_new_referrer_email text;
  v_already_has_referrer_coins boolean;
  v_already_has_referred_coins boolean;
  v_coins_to_referrer integer;
  v_coins_to_referred integer;
begin
  v_clean_username := lower(trim(coalesce(p_correct_referrer_username, '')));
  v_clean_username := regexp_replace(v_clean_username, '^@+', '');

  if v_clean_username = '' then
    return jsonb_build_object('error', 'Referrer username is required');
  end if;

  select * into v_referral
  from public.referrals
  where id = p_referral_id;

  if not found then
    return jsonb_build_object('error', 'Referral record not found');
  end if;

  if v_referral.corrected_at is not null then
    return jsonb_build_object('error', 'Correction already applied');
  end if;

  select pp.user_id, pp.username, pp.pen_name, a.full_name, a.email
    into v_new_referrer_id, v_new_referrer_username, v_new_referrer_pen_name, v_new_referrer_name, v_new_referrer_email
  from public.public_profiles pp
  join public.accounts a on a.user_id = pp.user_id
  where lower(coalesce(pp.username, '')) = v_clean_username
  limit 1;

  if v_new_referrer_id is null then
    return jsonb_build_object('error', 'Username not found: ' || v_clean_username);
  end if;

  if v_new_referrer_id = v_referral.referred_user_id then
    return jsonb_build_object('error', 'Referrer cannot be the same as the referred user');
  end if;

  select exists (
    select 1 from public.bloom_coin_ledger
    where user_id = v_new_referrer_id
      and reason = 'referral_referrer_bonus'
      and (metadata->>'referred_user_id') = v_referral.referred_user_id::text
  ) into v_already_has_referrer_coins;

  select exists (
    select 1 from public.bloom_coin_ledger
    where user_id = v_referral.referred_user_id
      and reason = 'referral_signup_bonus'
  ) into v_already_has_referred_coins;

  v_coins_to_referrer := case when v_already_has_referrer_coins then 0 else 100 end;
  v_coins_to_referred := case when v_already_has_referred_coins then 0 else 50 end;

  update public.referrals
  set
    referrer_user_id = v_new_referrer_id,
    referral_username_input = v_clean_username,
    referrer_username_snapshot = v_new_referrer_username,
    referrer_pen_name_snapshot = v_new_referrer_pen_name,
    referrer_name_snapshot = v_new_referrer_name,
    referrer_email_snapshot = v_new_referrer_email,
    status = 'verified',
    verified_at = coalesce(verified_at, now()),
    correction_original_referrer_username = coalesce(correction_original_referrer_username, referral_username_input),
    correction_new_referrer_username = v_clean_username,
    corrected_at = now(),
    corrected_by = p_admin_id,
    correction_coins_awarded = v_coins_to_referrer + v_coins_to_referred,
    updated_at = now()
  where id = p_referral_id;

  if v_coins_to_referrer > 0 then
    update public.accounts
    set bloom_coins = bloom_coins + v_coins_to_referrer, updated_at = now()
    where user_id = v_new_referrer_id;

    insert into public.bloom_coin_ledger (user_id, delta, reason, metadata)
    values (
      v_new_referrer_id, v_coins_to_referrer, 'referral_referrer_bonus',
      jsonb_build_object(
        'referred_user_id', v_referral.referred_user_id,
        'referrer_user_id', v_new_referrer_id,
        'referral_username', v_new_referrer_username,
        'coins', v_coins_to_referrer,
        'corrected_by', p_admin_id,
        'correction', true
      )
    );
  end if;

  if v_coins_to_referred > 0 then
    update public.accounts
    set bloom_coins = bloom_coins + v_coins_to_referred, updated_at = now()
    where user_id = v_referral.referred_user_id;

    insert into public.bloom_coin_ledger (user_id, delta, reason, metadata)
    values (
      v_referral.referred_user_id, v_coins_to_referred, 'referral_signup_bonus',
      jsonb_build_object(
        'referred_user_id', v_referral.referred_user_id,
        'referrer_user_id', v_new_referrer_id,
        'referral_username', v_new_referrer_username,
        'coins', v_coins_to_referred,
        'corrected_by', p_admin_id,
        'correction', true
      )
    );
  end if;

  insert into public.system_notifications (user_id, category, title, body, severity, dedupe_key)
  values (
    v_new_referrer_id,
    'system',
    'Thank you for referring a new member',
    'Thank you for referring ' || coalesce(nullif(trim(v_referral.referred_pen_name_snapshot), ''), coalesce('@' || v_referral.referred_username_snapshot, 'a new member')) || ' to Lethal Bloom Studio. Your referral was verified and 100 Bloom Coins have been added to your account.',
    'info',
    'referral-referrer-' || v_referral.referred_user_id::text
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;

  insert into public.system_notifications (user_id, category, title, body, severity, dedupe_key)
  values (
    v_referral.referred_user_id,
    'system',
    'Welcome to Lethal Bloom Studio',
    'You were referred to Lethal Bloom Studio by ' || coalesce(nullif(trim(v_new_referrer_pen_name), ''), '@' || v_new_referrer_username) || '. Your referral was verified and 50 Bloom Coins have been added to your account.',
    'info',
    'referral-referred-' || v_referral.referred_user_id::text
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;

  return jsonb_build_object(
    'ok', true,
    'referrer_username', v_new_referrer_username,
    'coins_to_referrer', v_coins_to_referrer,
    'coins_to_referred', v_coins_to_referred,
    'total_coins', v_coins_to_referrer + v_coins_to_referred
  );
end;
$function$;
