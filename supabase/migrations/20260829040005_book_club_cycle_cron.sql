-- Schedule advance_book_club_cycles() every 15 minutes -- same cadence and
-- reasoning as advance_bloom_circle_cycles() (20260829010005): the
-- grace-window deadline needs finer granularity than a daily tick, or
-- selection could lag by up to a day. Silently skipped if pg_cron isn't
-- enabled on this project, matching the existing cron migrations' pattern.
DO $$
BEGIN
  PERFORM cron.schedule(
    'advance-book-club-cycles',
    '*/15 * * * *',
    'SELECT public.advance_book_club_cycles()'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
