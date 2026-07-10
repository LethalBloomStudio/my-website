-- cleanup_read_notifications() (20260326000002) had a third branch that
-- deleted UNREAD rows once created_at alone was 30+ days old, regardless of
-- read status. Confirmed decision: unread notifications must never be
-- auto-deleted, no matter their age - only read/dismissed items age out.
-- Rebuilt here via CREATE OR REPLACE FUNCTION rather than editing
-- 20260326000002 directly, mirroring how award_chapter_coins was rebuilt in
-- 20260519000002 instead of touching its original migration - that original
-- migration may already be applied/tracked, and this keeps a clean record of
-- what changed and why.
--
-- Remaining logic (unchanged from 20260326000002): delete a row only if
-- is_read = true, using read_at if set, falling back to created_at if a read
-- row somehow has no read_at. is_read = false rows are never touched by
-- either branch, regardless of age.
CREATE OR REPLACE FUNCTION public.cleanup_read_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.system_notifications
  WHERE (
    (is_read = true AND read_at IS NOT NULL AND read_at < now() - interval '30 days')
    OR
    (is_read = true AND read_at IS NULL AND created_at < now() - interval '30 days')
  );
END;
$$;

-- Activates the schedule that 20260326000002 left as a commented-out manual
-- step. Same self-activating pattern as the other cleanup jobs in this
-- codebase - silently skipped if pg_cron isn't enabled on this project.
DO $$
BEGIN
  PERFORM cron.schedule(
    'cleanup-read-notifications',
    '0 3 * * *',
    'SELECT public.cleanup_read_notifications()'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
