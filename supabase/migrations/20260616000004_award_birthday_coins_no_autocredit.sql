-- Rework award_birthday_coins() so it only records the award and sends the
-- notification. Coins are credited only when the user actively claims them.
CREATE OR REPLACE FUNCTION public.award_birthday_coins()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r            RECORD;
  v_award_id   UUID;
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
    -- Record the unclaimed award (claimed_at stays NULL until the user claims)
    INSERT INTO public.birthday_coin_awards (user_id, awarded_year, coins_awarded)
    VALUES (r.user_id, current_year, 100)
    RETURNING id INTO v_award_id;

    -- Notification carries birthday_award_id + reward_coins so the
    -- notifications page can render a claim button.
    INSERT INTO public.system_notifications (user_id, category, title, body, severity, dedupe_key, metadata)
    VALUES (
      r.user_id,
      'birthday_coins',
      'Happy Birthday from Lethal Bloom!',
      '🎉 Wishing you a beautiful birthday! 🌹 Thank you for being part of the Lethal Bloom community. Here''s 100 bloom coins on us! ✿',
      'info',
      'birthday-coins-' || current_year,
      jsonb_build_object(
        'birthday_award_id', v_award_id,
        'reward_coins', 100
      )
    )
    ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END LOOP;
END;
$$;
