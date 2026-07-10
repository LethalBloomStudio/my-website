-- notification_read_keys (20260607000001) has never been pruned - confirmed
-- empirically, 1,366+ rows over 30 days old already present with no deletion
-- path anywhere in the app. read_at is the table's only timestamp column; it's
-- set once at insert (default now()) and never updated afterward, so it
-- doubles as "when this row was created" for pruning purposes.
CREATE OR REPLACE FUNCTION public.cleanup_notification_read_keys()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.notification_read_keys
  WHERE read_at < now() - interval '30 days';
$$;

-- Same self-activating pattern as the other cleanup jobs in this codebase -
-- silently skipped if pg_cron isn't enabled on this project.
DO $$
BEGIN
  PERFORM cron.schedule(
    'cleanup-notification-read-keys',
    '0 3 * * *',
    'SELECT public.cleanup_notification_read_keys()'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
