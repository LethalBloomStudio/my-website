-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)

-- 1. Add reward_coins to announcements
ALTER TABLE public.admin_announcements
  ADD COLUMN IF NOT EXISTS reward_coins int;

-- 2. Add metadata jsonb to system_notifications (stores announcement_id + reward_coins)
ALTER TABLE public.system_notifications
  ADD COLUMN IF NOT EXISTS metadata jsonb;

-- 3. Claim tracking table
CREATE TABLE IF NOT EXISTS public.announcement_coin_claims (
  announcement_id uuid NOT NULL,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claimed_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

ALTER TABLE public.announcement_coin_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS claims_select_own ON public.announcement_coin_claims;
CREATE POLICY claims_select_own ON public.announcement_coin_claims
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS claims_insert_own ON public.announcement_coin_claims;
CREATE POLICY claims_insert_own ON public.announcement_coin_claims
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins can read all claims
DROP POLICY IF EXISTS claims_admin_select ON public.announcement_coin_claims;
CREATE POLICY claims_admin_select ON public.announcement_coin_claims
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.accounts WHERE user_id = auth.uid() AND is_admin = true)
  );
