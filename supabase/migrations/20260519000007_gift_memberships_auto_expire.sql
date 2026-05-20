-- ── Gift membership auto-expiry ───────────────────────────────────────────────
-- Mirrors the bloom events expiry pattern:
--   1. expire_gift_memberships() — dedicated cleanup function.
--   2. pg_cron daily job at 02:00 UTC (silently skipped if extension absent).
--
-- 'expired' is semantically distinct from 'revoked' (natural time passage vs.
-- admin action), so it is added as a third valid status value.

-- ── 1. Extend status check constraint to allow 'expired' ─────────────────────

ALTER TABLE public.gift_memberships
  DROP CONSTRAINT IF EXISTS gift_memberships_status_check;

ALTER TABLE public.gift_memberships
  ADD CONSTRAINT gift_memberships_status_check
    CHECK (status IN ('active', 'revoked', 'expired'));

-- ── 2. Expiry function ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.expire_gift_memberships()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Clear gift columns from accounts for all memberships whose ends_at has passed.
  -- For gift-only users (not a paying subscriber) this explicitly reverts
  -- subscription_status to 'free'. Paid subscribers keep their status unchanged.
  UPDATE public.accounts
  SET    active_gift_membership_id = NULL,
         gift_access_expires_at    = NULL,
         subscription_status       = CASE
           WHEN subscription_status NOT IN ('lethal', 'lethal_annual')
           THEN 'free'
           ELSE subscription_status
         END,
         updated_at                = now()
  WHERE  active_gift_membership_id IN (
    SELECT id
    FROM   public.gift_memberships
    WHERE  status  = 'active'
      AND  ends_at < now()
  );

  -- Mark the gift rows expired
  UPDATE public.gift_memberships
  SET    status = 'expired'
  WHERE  status  = 'active'
    AND  ends_at < now();
$$;

-- ── 3. Daily pg_cron job at 02:00 UTC ────────────────────────────────────────
-- Silently skipped if pg_cron is not enabled on this project.

DO $$
BEGIN
  PERFORM cron.schedule(
    'expire-gift-memberships',
    '0 2 * * *',
    'SELECT public.expire_gift_memberships()'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
