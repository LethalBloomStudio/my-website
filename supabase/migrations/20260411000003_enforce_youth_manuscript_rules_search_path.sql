create or replace function public.enforce_youth_manuscript_rules()
returns trigger
language plpgsql
set search_path = public
as $function$
        declare
          acct_age public.age_category;
        begin
          select a.age_category into acct_age
          from public.accounts a
          where a.user_id = new.owner_id;

          if acct_age = 'youth_13_17' and new.age_rating <> 'teen_safe' then
            raise exception 'Youth profiles may only submit teen_safe manuscripts.';
          end if;

          return new;
        end;
        $function$;
