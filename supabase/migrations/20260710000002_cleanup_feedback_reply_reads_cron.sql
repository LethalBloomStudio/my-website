-- feedback_reply_reads (20260607000002) has never been pruned either - a
-- delete-own RLS policy exists on the table but nothing in application code
-- ever calls it. read_at is the table's only timestamp column, set once at
-- insert and never updated, so it doubles as "when this row was created"
-- for pruning purposes, same as notification_read_keys.
CREATE OR REPLACE FUNCTION public.cleanup_feedback_reply_reads()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.feedback_reply_reads
  WHERE read_at < now() - interval '30 days';
$$;

-- Same self-activating pattern as the other cleanup jobs in this codebase -
-- silently skipped if pg_cron isn't enabled on this project.
DO $$
BEGIN
  PERFORM cron.schedule(
    'cleanup-feedback-reply-reads',
    '0 3 * * *',
    'SELECT public.cleanup_feedback_reply_reads()'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
