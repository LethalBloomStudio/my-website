create or replace function public.handle_new_user_profiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into public.profiles_private (user_id) values (new.id)
  on conflict (user_id) do nothing;

  insert into public.profiles_public (user_id) values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$function$;
