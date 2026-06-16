-- Extend award_birthday_coins() to also notify all accepted friends of the
-- birthday user so they can send a gift or birthday message.
CREATE OR REPLACE FUNCTION public.award_birthday_coins()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r            RECORD;
  friend       RECORD;
  v_award_id   UUID;
  v_name       TEXT;
  v_username   TEXT;
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
    -- Record unclaimed award
    INSERT INTO public.birthday_coin_awards (user_id, awarded_year, coins_awarded)
    VALUES (r.user_id, current_year, 100)
    RETURNING id INTO v_award_id;

    -- Notify birthday user (with claim button)
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

    -- Resolve display name for friend notifications
    SELECT
      COALESCE(NULLIF(TRIM(pen_name), ''), NULLIF(TRIM(username), ''), 'A member'),
      COALESCE(NULLIF(TRIM(username), ''), '')
    INTO v_name, v_username
    FROM public.public_profiles
    WHERE user_id = r.user_id;

    -- Notify every accepted friend
    FOR friend IN
      SELECT
        CASE
          WHEN pfr.sender_id   = r.user_id THEN pfr.receiver_id
          ELSE pfr.sender_id
        END AS friend_id
      FROM public.profile_friend_requests pfr
      WHERE (pfr.sender_id = r.user_id OR pfr.receiver_id = r.user_id)
        AND pfr.status = 'accepted'
    LOOP
      INSERT INTO public.system_notifications (user_id, category, title, body, severity, dedupe_key, metadata)
      VALUES (
        friend.friend_id,
        'birthday_friend',
        '🎂 It''s ' || v_name || '''s birthday today!',
        'Send them a birthday message or surprise them with a Bloom Coin gift.',
        'info',
        'birthday-friend-' || r.user_id || '-' || current_year,
        jsonb_build_object(
          'birthday_user_id',       r.user_id,
          'birthday_user_name',     v_name,
          'birthday_user_username', v_username
        )
      )
      ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;
