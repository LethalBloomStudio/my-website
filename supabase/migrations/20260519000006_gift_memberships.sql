-- ─── Gift Memberships ─────────────────────────────────────────────────────────
-- Tracks admin-granted membership periods, distinct from paid and promotional
-- access. Follows the same denorm pattern as promotions: a pointer + expiry
-- cached on accounts for fast lookups, full history kept in gift_memberships.

CREATE TABLE IF NOT EXISTS public.gift_memberships (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  months      INTEGER     NOT NULL CHECK (months IN (1, 2, 3, 6, 12)),
  starts_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at     TIMESTAMPTZ GENERATED ALWAYS AS
                (starts_at + (months * INTERVAL '1 month')) STORED,
  status      TEXT        NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'revoked')),
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gift_memberships_revoke_consistency
    CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS gift_memberships_user_id_idx
  ON public.gift_memberships (user_id);

CREATE INDEX IF NOT EXISTS gift_memberships_granted_by_idx
  ON public.gift_memberships (granted_by);

CREATE INDEX IF NOT EXISTS gift_memberships_active_idx
  ON public.gift_memberships (user_id, ends_at)
  WHERE status = 'active';

-- Denormalized on accounts so membership-type checks are a single row read.
-- active_gift_membership_id → the current (or last) gift row
-- gift_access_expires_at    → mirrors gift_memberships.ends_at at grant time
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS active_gift_membership_id UUID
    REFERENCES public.gift_memberships(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gift_access_expires_at TIMESTAMPTZ;

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.gift_memberships ENABLE ROW LEVEL SECURITY;

-- Admins have full read/write access
DROP POLICY IF EXISTS "gift_memberships_admin_all" ON public.gift_memberships;
CREATE POLICY "gift_memberships_admin_all"
  ON public.gift_memberships FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts
      WHERE user_id = (SELECT auth.uid()) AND is_admin = true
    )
  );

-- Recipients can read their own rows (so the UI can show grant details)
DROP POLICY IF EXISTS "gift_memberships_select_own" ON public.gift_memberships;
CREATE POLICY "gift_memberships_select_own"
  ON public.gift_memberships FOR SELECT
  USING ((SELECT auth.uid()) = user_id);
