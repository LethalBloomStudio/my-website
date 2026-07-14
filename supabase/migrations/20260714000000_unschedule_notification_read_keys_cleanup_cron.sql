-- Reverses the cron activated in 20260710000001_cleanup_notification_read_keys_cron.sql.
-- That job deletes notification_read_keys rows with read_at older than 30 days, which
-- undoes the 2026-06-07 decision (2721873) to make read-keys permanent - a decision that
-- was safe only because notifications/page.tsx's own feed queries already age-gate their
-- source rows at 30 days. NotificationButton.tsx and MobileNav.tsx's badge-count queries
-- never replicated that age gate, so once a read-key aged out, its (already 30+ days old,
-- already-hidden-on-the-page) source row would silently flip back to "unread" in the
-- badge with no way for the user to ever mark it read again. Unscheduling restores the
-- last known-good state: read-keys persist indefinitely.
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-notification-read-keys');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
