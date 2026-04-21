alter table public.referrals
  add column if not exists referred_email_snapshot text,
  add column if not exists referred_name_snapshot text,
  add column if not exists referred_username_snapshot text,
  add column if not exists referred_pen_name_snapshot text,
  add column if not exists referrer_email_snapshot text,
  add column if not exists referrer_name_snapshot text,
  add column if not exists referrer_username_snapshot text,
  add column if not exists referrer_pen_name_snapshot text;

update public.referrals r
set
  referred_email_snapshot = coalesce(r.referred_email_snapshot, a.email),
  referred_name_snapshot = coalesce(r.referred_name_snapshot, a.full_name),
  referred_username_snapshot = coalesce(r.referred_username_snapshot, p.username),
  referred_pen_name_snapshot = coalesce(r.referred_pen_name_snapshot, p.pen_name)
from public.accounts a
left join public.public_profiles p on p.user_id = a.user_id
where a.user_id = r.referred_user_id;

update public.referrals r
set
  referrer_email_snapshot = coalesce(r.referrer_email_snapshot, a.email),
  referrer_name_snapshot = coalesce(r.referrer_name_snapshot, a.full_name),
  referrer_username_snapshot = coalesce(r.referrer_username_snapshot, p.username),
  referrer_pen_name_snapshot = coalesce(r.referrer_pen_name_snapshot, p.pen_name)
from public.accounts a
left join public.public_profiles p on p.user_id = a.user_id
where a.user_id = r.referrer_user_id;

alter table public.referrals
  drop constraint if exists referrals_referred_user_id_fkey;

alter table public.referrals
  drop constraint if exists referrals_referrer_user_id_fkey;

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

  select full_name, email
    into v_referrer_name, v_referrer_email
  from public.accounts
  where user_id = v_referrer_id;

  select p.username, p.pen_name, a.full_name, a.email
    into v_referred_username, v_referred_pen_name, v_referred_name, v_referred_email
  from public.accounts a
  left join public.public_profiles p on p.user_id = a.user_id
  where a.user_id = p_referred_user_id;

  if v_referrer_id is null then
    insert into public.referrals (
      referred_user_id,
      referrer_user_id,
      referral_username_input,
      status,
      referred_email_snapshot,
      referred_name_snapshot,
      referred_username_snapshot,
      referred_pen_name_snapshot,
      updated_at
    )
    values (
      p_referred_user_id,
      null,
      v_input,
      'invalid_referrer',
      v_referred_email,
      v_referred_name,
      v_referred_username,
      v_referred_pen_name,
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
      referred_email_snapshot,
      referred_name_snapshot,
      referred_username_snapshot,
      referred_pen_name_snapshot,
      referrer_email_snapshot,
      referrer_name_snapshot,
      referrer_username_snapshot,
      referrer_pen_name_snapshot,
      updated_at
    )
    values (
      p_referred_user_id,
      v_referrer_id,
      v_input,
      'invalid_self',
      v_referred_email,
      v_referred_name,
      v_referred_username,
      v_referred_pen_name,
      v_referrer_email,
      v_referrer_name,
      v_referrer_username,
      v_referrer_pen_name,
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
    referred_email_snapshot,
    referred_name_snapshot,
    referred_username_snapshot,
    referred_pen_name_snapshot,
    referrer_email_snapshot,
    referrer_name_snapshot,
    referrer_username_snapshot,
    referrer_pen_name_snapshot,
    updated_at
  )
  values (
    p_referred_user_id,
    v_referrer_id,
    v_input,
    'verified',
    now(),
    v_referred_email,
    v_referred_name,
    v_referred_username,
    v_referred_pen_name,
    v_referrer_email,
    v_referrer_name,
    v_referrer_username,
    v_referrer_pen_name,
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
