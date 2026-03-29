-- Notify all admin profiles when a new member joins (youth or adult)

CREATE OR REPLACE FUNCTION public.notify_admins_on_new_signup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  profile_type text;
BEGIN
  -- Determine profile type from age_category
  profile_type := CASE
    WHEN NEW.age_category = 'youth_13_17' THEN 'Youth'
    ELSE 'Adult'
  END;

  -- Insert one notification per admin
  INSERT INTO public.system_notifications (user_id, category, title, body, severity, dedupe_key)
  SELECT
    a.user_id,
    'account_action',
    'New Member Joined',
    profile_type || ' profile joined Lethal Bloom Studio. (User ID: ' || NEW.user_id || ')',
    'info',
    'new-member-' || NEW.user_id || '-' || a.user_id
  FROM public.accounts a
  WHERE a.is_admin = true
    AND a.user_id <> NEW.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admins_on_new_signup ON public.accounts;
CREATE TRIGGER trg_notify_admins_on_new_signup
AFTER INSERT ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_new_signup();
