-- ─── Admin Auto-Friends Migration ─────────────────────────────────────────────
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor).
-- It adds triggers and RLS rules so admin friendships are enforced at the DB level.

-- 1. Trigger: when a new account row is inserted, auto-friend with all admins
CREATE OR REPLACE FUNCTION public.auto_friend_admins()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profile_friend_requests (sender_id, receiver_id, status)
  SELECT NEW.user_id, a.user_id, 'accepted'
  FROM public.accounts a
  WHERE a.is_admin = true AND a.user_id <> NEW.user_id
  ON CONFLICT (sender_id, receiver_id) DO UPDATE SET status = 'accepted';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_friend_admins ON public.accounts;
CREATE TRIGGER trg_auto_friend_admins
AFTER INSERT ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.auto_friend_admins();

-- 2. Trigger: when is_admin flips to true, friend that admin with every user
CREATE OR REPLACE FUNCTION public.auto_friend_on_admin_grant()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.is_admin = true AND (OLD.is_admin IS DISTINCT FROM true) THEN
    INSERT INTO public.profile_friend_requests (sender_id, receiver_id, status)
    SELECT NEW.user_id, u.user_id, 'accepted'
    FROM public.accounts u
    WHERE u.user_id <> NEW.user_id
    ON CONFLICT (sender_id, receiver_id) DO UPDATE SET status = 'accepted';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_friend_on_admin_grant ON public.accounts;
CREATE TRIGGER trg_auto_friend_on_admin_grant
AFTER UPDATE OF is_admin ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.auto_friend_on_admin_grant();

-- 3. RLS: prevent users from deleting friend rows that involve an admin
DROP POLICY IF EXISTS friend_requests_delete_participant ON public.profile_friend_requests;
CREATE POLICY friend_requests_delete_participant ON public.profile_friend_requests
FOR DELETE USING (
  (auth.uid() = sender_id OR auth.uid() = receiver_id)
  AND NOT EXISTS (
    SELECT 1 FROM public.accounts
    WHERE user_id IN (sender_id, receiver_id) AND is_admin = true
  )
);

-- 4. RLS: prevent updating admin friendships to blocked/unfriended
DROP POLICY IF EXISTS friend_requests_update_participant ON public.profile_friend_requests;
CREATE POLICY friend_requests_update_participant ON public.profile_friend_requests
FOR UPDATE
USING (auth.uid() = sender_id OR auth.uid() = receiver_id)
WITH CHECK (
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.accounts
      WHERE user_id IN (sender_id, receiver_id) AND is_admin = true
    )
    THEN status = 'accepted'
    ELSE true
  END
);

-- 5. Backfill: create accepted friendships between all existing admins and all users
INSERT INTO public.profile_friend_requests (sender_id, receiver_id, status)
SELECT a.user_id, u.user_id, 'accepted'
FROM public.accounts a
CROSS JOIN public.accounts u
WHERE a.is_admin = true AND a.user_id <> u.user_id
ON CONFLICT (sender_id, receiver_id) DO UPDATE SET status = 'accepted';
