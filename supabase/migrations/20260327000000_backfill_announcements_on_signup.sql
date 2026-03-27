-- When a new account is created, automatically create system_notification entries
-- for any admin announcements that are still active (within 7 days of creation).
-- This ensures users who sign up after an announcement can still see and claim it.

CREATE OR REPLACE FUNCTION public.notify_new_user_of_active_announcements()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.system_notifications (user_id, category, title, body, severity, metadata)
  SELECT
    NEW.user_id,
    'announcement',
    a.title,
    a.body,
    'info',
    jsonb_build_object(
      'announcement_id', a.id,
      'reward_coins', a.reward_coins
    )
  FROM public.admin_announcements a
  WHERE
    a.created_at >= now() - interval '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.system_notifications n
      WHERE n.user_id = NEW.user_id
        AND n.metadata->>'announcement_id' = a.id::text
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_user_of_announcements ON public.accounts;
CREATE TRIGGER trg_notify_new_user_of_announcements
AFTER INSERT ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.notify_new_user_of_active_announcements();
