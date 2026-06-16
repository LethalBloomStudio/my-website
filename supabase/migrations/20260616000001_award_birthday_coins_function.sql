CREATE OR REPLACE FUNCTION public.award_birthday_coins()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r            RECORD;
  current_year INT := EXTRACT(YEAR FROM now())::INT;
BEGIN
  FOR r IN
    SELECT user_id
    FROM public.accounts
    WHERE
      dob IS NOT NULL
      AND EXTRACT(MONTH FROM dob) = EXTRACT(MONTH FROM now())
      AND EXTRACT(DAY   FROM dob) = EXTRACT(DAY   FROM now())
      AND NOT EXISTS (
        SELECT 1 FROM public.birthday_coin_awards
        WHERE user_id    = accounts.user_id
          AND awarded_year = current_year
      )
  LOOP
    -- Credit coins to wallet
    UPDATE public.accounts
    SET bloom_coins = bloom_coins + 100,
        updated_at  = now()
    WHERE user_id = r.user_id;

    -- Record in the ledger (matches pattern used by award_chapter_coins)
    INSERT INTO public.bloom_coin_ledger (user_id, delta, reason, metadata)
    VALUES (
      r.user_id,
      100,
      'birthday_reward',
      jsonb_build_object('awarded_year', current_year)
    );

    -- Track award so it cannot fire twice in the same calendar year
    INSERT INTO public.birthday_coin_awards (user_id, awarded_year, coins_awarded)
    VALUES (r.user_id, current_year, 100);

    -- In-app notification
    INSERT INTO public.system_notifications (user_id, category, title, body, severity, dedupe_key)
    VALUES (
      r.user_id,
      'birthday_coins',
      'Happy Birthday from Lethal Bloom!',
      '🎉 Wishing you a beautiful birthday! 🌹 Thank you for being part of the Lethal Bloom community here''s 100 bloom coins on us! ✿',
      'info',
      'birthday-coins-' || current_year
    )
    ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END LOOP;
END;
$$;
