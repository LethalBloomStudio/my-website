create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referred_user_id uuid not null unique references auth.users(id) on delete cascade,
  referrer_user_id uuid references auth.users(id) on delete set null,
  referral_username_input text not null,
  status text not null default 'verified',
  referrer_reward_coins integer not null default 100,
  referred_reward_coins integer not null default 50,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referrals_status_check check (status in ('verified', 'invalid_referrer', 'invalid_self'))
);

create index if not exists referrals_referrer_user_id_idx
on public.referrals (referrer_user_id, created_at desc);

create index if not exists referrals_status_idx
on public.referrals (status, created_at desc);

alter table public.referrals enable row level security;

drop policy if exists "referrals_select_own" on public.referrals;
create policy "referrals_select_own"
on public.referrals for select
using (auth.uid() = referred_user_id or auth.uid() = referrer_user_id);

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
      'Referral reward earned',
      'A new member joined using your referral and you earned 100 Bloom Coins.',
      'info',
      'referral-referrer-' || p_referred_user_id::text
    ),
    (
      p_referred_user_id,
      'system',
      'Referral bonus applied',
      'Your referral was verified and 50 Bloom Coins were added to your account.',
      'info',
      'referral-referred-' || p_referred_user_id::text
    );
end;
$function$;

create or replace function public.handle_new_user_profiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_age_cat public.age_category;
begin
  insert into public.profiles_private (user_id) values (new.id)
  on conflict (user_id) do nothing;

  insert into public.profiles_public (user_id) values (new.id)
  on conflict (user_id) do nothing;

  begin
    v_age_cat := coalesce(
      (new.raw_user_meta_data->>'age_category')::public.age_category,
      'adult_18_plus'
    );
  exception when others then
    v_age_cat := 'adult_18_plus';
  end;

  insert into public.accounts (
    user_id,
    email,
    full_name,
    dob,
    age_category,
    parental_consent,
    last_active_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    (new.raw_user_meta_data->>'full_name'),
    case
      when (new.raw_user_meta_data->>'dob') is not null
       and (new.raw_user_meta_data->>'dob') ~ '^\d{4}-\d{2}-\d{2}$'
      then (new.raw_user_meta_data->>'dob')::date
      else null
    end,
    v_age_cat,
    coalesce((new.raw_user_meta_data->>'parental_consent')::boolean, false),
    now(),
    now()
  )
  on conflict (user_id) do nothing;

  perform public.apply_signup_referral(new.id, new.raw_user_meta_data->>'referral_username');

  return new;
end;
$function$;
