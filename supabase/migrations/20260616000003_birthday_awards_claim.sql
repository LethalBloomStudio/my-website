-- Add claimed_at so coins are only credited when the user actively claims them.
ALTER TABLE public.birthday_coin_awards
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- Admins can read all records to see sent + claimed status per user.
CREATE POLICY "Admins can view all birthday awards"
  ON public.birthday_coin_awards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts
      WHERE user_id = auth.uid() AND is_admin = true
    )
  );
