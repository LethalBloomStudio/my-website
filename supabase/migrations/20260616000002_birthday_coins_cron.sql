-- Schedule award_birthday_coins() at 09:00 UTC daily.
-- Silently skipped if pg_cron is not enabled on this project.
DO $$
BEGIN
  PERFORM cron.schedule(
    'award-birthday-coins-daily',
    '0 9 * * *',
    'SELECT public.award_birthday_coins()'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
