-- Promotions system
-- Allows admins to run time-limited campaigns that grant Lethal Member benefits
-- to free users (new signups, existing free members, or both).

CREATE TABLE IF NOT EXISTS public.promotions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  description     TEXT,
  benefit         TEXT        NOT NULL DEFAULT 'lethal_benefits',
  duration_days   INTEGER     NOT NULL CHECK (duration_days > 0),
  applies_to      TEXT        NOT NULL DEFAULT 'new_signups'
                              CHECK (applies_to IN ('new_signups', 'all_free', 'both')),
  bonus_coins     INTEGER     NOT NULL DEFAULT 0 CHECK (bonus_coins >= 0),
  max_users       INTEGER     CHECK (max_users IS NULL OR max_users > 0),
  status          TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'paused', 'ended')),
  enrolled_count  INTEGER     NOT NULL DEFAULT 0,
  created_by      UUID        REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  ended_at        TIMESTAMPTZ
);

-- Track per-user promotion state directly on accounts for fast lookups
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS active_promotion_id   UUID        REFERENCES public.promotions(id),
  ADD COLUMN IF NOT EXISTS promotion_expires_at  TIMESTAMPTZ;

-- RLS
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage promotions"
  ON public.promotions FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.accounts WHERE user_id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Authenticated users read active promotions"
  ON public.promotions FOR SELECT TO authenticated
  USING (status = 'active');
