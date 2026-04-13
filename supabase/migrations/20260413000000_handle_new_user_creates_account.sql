-- Ensure handle_new_user_profiles() also creates the accounts row immediately
-- on auth.users insert. This covers the email-confirmation flow where the
-- client-side sign-up form never reaches its accounts.upsert() call because
-- data.session is null until the link is clicked.
--
-- Using ON CONFLICT DO NOTHING so that if the sign-up form already created the
-- row (no-confirmation flow) it is not touched.

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

  -- Coerce age_category safely; fall back to adult_18_plus if missing/invalid
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

  return new;
end;
$function$;
