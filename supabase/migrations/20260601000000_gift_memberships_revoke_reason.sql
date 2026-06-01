-- Add revoke_reason to gift_memberships so we can distinguish admin revokes
-- from automatic voids caused by the user purchasing a paid subscription.

ALTER TABLE public.gift_memberships
  ADD COLUMN IF NOT EXISTS revoke_reason TEXT
    CHECK (
      revoke_reason IS NULL
      OR revoke_reason IN ('manual_revoke', 'superseded_by_purchase')
    );
