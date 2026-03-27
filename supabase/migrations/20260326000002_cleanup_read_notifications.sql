-- Auto-delete read notifications older than 30 days
-- Uses read_at if set, otherwise falls back to created_at

create or replace function public.cleanup_read_notifications()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.system_notifications
  where is_read = true
    and (
      (read_at is not null and read_at < now() - interval '30 days')
      or
      (read_at is null and created_at < now() - interval '30 days')
    );
end;
$$;

-- Schedule daily at 3am UTC
-- Run this manually in the Supabase SQL Editor to activate:
-- select cron.schedule('cleanup-read-notifications', '0 3 * * *', $$select public.cleanup_read_notifications();$$);
