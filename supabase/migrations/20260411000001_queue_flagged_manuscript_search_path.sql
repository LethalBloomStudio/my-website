create or replace function public.queue_flagged_manuscript()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if (new.flagged = true) and (coalesce(old.flagged, false) = false) then
    insert into public.review_queue (manuscript_id, status, notes)
    values (new.id, 'pending', new.flagged_reason)
    on conflict (manuscript_id) do nothing;
  end if;

  return new;
end;
$function$;
