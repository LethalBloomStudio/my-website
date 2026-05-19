-- Rebuild award_chapter_coins to apply a Bloom Event bonus.
-- When an active event's categories overlap with the manuscript's categories,
-- award 10 coins instead of 5 and record the event_id in the ledger.
-- All existing behaviour (idempotency guard, grant check, wallet update) is unchanged.

CREATE OR REPLACE FUNCTION public.award_chapter_coins(
  p_chapter_id    uuid,
  p_manuscript_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reader_id   uuid := auth.uid();
  v_coins       int  := 5;
  v_new_balance bigint;
  v_event_id    uuid := null;
  v_event_cats  text[];
  v_ms_cats     text[];
BEGIN
  IF v_reader_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Already completed this chapter — return gracefully (idempotency guard unchanged)
  IF EXISTS (
    SELECT 1 FROM chapter_read_completions
    WHERE chapter_id = p_chapter_id AND reader_id = v_reader_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_completed');
  END IF;

  -- Must hold an access grant (beta reader) — owners do not earn coins
  IF NOT EXISTS (
    SELECT 1 FROM manuscript_access_grants
    WHERE manuscript_id = p_manuscript_id AND reader_id = v_reader_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_grant');
  END IF;

  -- Check for an active Bloom Event that is currently within its date window
  SELECT id, categories
  INTO v_event_id, v_event_cats
  FROM bloom_events
  WHERE status = 'active'
    AND start_date <= CURRENT_DATE
    AND end_date   >= CURRENT_DATE
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_event_id IS NOT NULL THEN
    -- Fetch the manuscript's categories
    SELECT categories INTO v_ms_cats
    FROM manuscripts
    WHERE id = p_manuscript_id;

    -- && is the PostgreSQL array-overlap operator; true when the two arrays share at least one element
    IF v_ms_cats IS NOT NULL AND v_ms_cats && v_event_cats THEN
      v_coins := 10;
    ELSE
      v_event_id := null; -- no category match — don't credit the event
    END IF;
  END IF;

  -- Record the completion (coins_awarded reflects the bonus when applicable)
  INSERT INTO chapter_read_completions(chapter_id, manuscript_id, reader_id, coins_awarded)
  VALUES (p_chapter_id, p_manuscript_id, v_reader_id, v_coins);

  -- Credit the wallet
  UPDATE public.accounts
  SET bloom_coins = bloom_coins + v_coins,
      updated_at  = now()
  WHERE user_id = v_reader_id
  RETURNING bloom_coins INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  -- Audit log — event_id is non-null only when a Bloom Event bonus was applied
  INSERT INTO public.bloom_coin_ledger(user_id, delta, reason, metadata, event_id)
  VALUES (
    v_reader_id,
    v_coins,
    'chapter_feedback_reward',
    jsonb_build_object(
      'chapter_id',    p_chapter_id,
      'manuscript_id', p_manuscript_id,
      'coins',         v_coins
    ),
    v_event_id
  );

  RETURN jsonb_build_object(
    'success',       true,
    'coins_awarded', v_coins,
    'new_balance',   v_new_balance
  );
END;
$$;
